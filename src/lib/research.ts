import type {
  ContentBlock,
  Message,
  MessageParam,
  TextBlock,
} from "@anthropic-ai/sdk/resources/messages/messages";
import { getClient, RESEARCH_MODEL, DEFAULT_RESEARCH_MAX_TOKENS } from "./anthropic.js";
import { researchSystemPrompt } from "./prompts.js";
import type { RegistryInfo, ResearchInput } from "./types.js";

const MAX_PAUSE_CONTINUATIONS = 5;

export interface ResearchResult {
  memo: string;
  model: string;
}

/**
 * Phase 1: deep, agentic web research via Claude's server-side web_search tool.
 * Streams (required for this max_tokens size) and follows `pause_turn` resumptions -
 * the server-side search loop pauses after its internal iteration cap and must be
 * resumed by resending the conversation, per Anthropic's tool-use docs.
 */
export interface ResearchOptions {
  model?: string;
  maxTokens?: number;
  onProgress?: (text: string) => void;
}

export async function runDeepResearch(
  input: ResearchInput,
  registration: RegistryInfo | null,
  options: ResearchOptions = {}
): Promise<ResearchResult> {
  const client = getClient();
  const model = options.model || RESEARCH_MODEL;
  const maxTokens = options.maxTokens || DEFAULT_RESEARCH_MAX_TOKENS;

  const registrationBlock = registration
    ? `\n\nCompany registration data already found on the company's own website (trust this, no need to re-find it):\n${JSON.stringify(registration, null, 2)}`
    : input.website
      ? `\n\nNo company registration number was found automatically. Use the web_fetch tool to fetch ${input.website} and, if needed, its imprint/legal-notice/"Impressum"/kontakt page, and try to find the official registration number yourself (e.g. Danish CVR, German Handelsregister/HRB, Norwegian/Swedish Org.nr, or an EU VAT ID). Report it in your memo with the exact page you found it on, or state plainly that you could not find one.`
      : "";

  const userPrompt = `Research this prospect company for Exemplar's sales team:

Company name: ${input.companyName}
Website: ${input.website || "(not provided - find it)"}
${input.notes ? `Additional notes from the sales rep: ${input.notes}` : ""}${registrationBlock}

Dig deep. Find concrete, current, cited signals per the taxonomy in your instructions.`;

  let messages: MessageParam[] = [{ role: "user", content: userPrompt }];
  let finalMessage: Message | null = null;

  const today = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < MAX_PAUSE_CONTINUATIONS; i++) {
    const stream = client.messages.stream({
      model,
      max_tokens: maxTokens,
      system: researchSystemPrompt(today),
      thinking: { type: "adaptive" },
      output_config: { effort: "xhigh" },
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 10 },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 6 },
      ],
      messages,
    });

    if (options.onProgress) {
      stream.on("text", (delta: string) => options.onProgress!(delta));
    }

    finalMessage = await stream.finalMessage();

    if (finalMessage.stop_reason !== "pause_turn") break;

    messages = [...messages, { role: "assistant", content: finalMessage.content }];
  }

  if (!finalMessage) {
    throw new Error("Research call produced no response.");
  }

  if (finalMessage.stop_reason === "refusal") {
    throw new Error(
      "Claude declined to research this company (safety refusal). Try rephrasing the company name/notes."
    );
  }

  const memo = finalMessage.content
    .filter((block: ContentBlock): block is TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");

  if (!memo.trim()) {
    throw new Error("Research call returned no text content.");
  }

  return { memo, model: finalMessage.model };
}
