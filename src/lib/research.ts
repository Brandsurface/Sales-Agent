import type Anthropic from "@anthropic-ai/sdk";
import { getClient, RESEARCH_MODEL } from "./anthropic.js";
import { researchSystemPrompt } from "./prompts.js";
import type { CvrInfo, ResearchInput } from "./types.js";

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
export async function runDeepResearch(
  input: ResearchInput,
  cvr: CvrInfo | null,
  onProgress?: (text: string) => void
): Promise<ResearchResult> {
  const client = getClient();

  const cvrBlock = cvr
    ? `\n\nDanish business registry (CVR) data found:\n${JSON.stringify(cvr, null, 2)}`
    : "";

  const userPrompt = `Research this prospect company for Exemplar's sales team:

Company name: ${input.companyName}
Website: ${input.website || "(not provided - find it)"}
${input.notes ? `Additional notes from the sales rep: ${input.notes}` : ""}${cvrBlock}

Dig deep. Find concrete, current, cited signals per the taxonomy in your instructions.`;

  let messages: Anthropic.MessageParam[] = [{ role: "user", content: userPrompt }];
  let finalMessage: Anthropic.Message | null = null;

  for (let i = 0; i < MAX_PAUSE_CONTINUATIONS; i++) {
    const stream = client.messages.stream({
      model: RESEARCH_MODEL,
      max_tokens: 16000,
      system: researchSystemPrompt(),
      thinking: { type: "adaptive" },
      output_config: { effort: "high" },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 8 }],
      messages,
    });

    if (onProgress) {
      stream.on("text", (delta) => onProgress(delta));
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
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");

  if (!memo.trim()) {
    throw new Error("Research call returned no text content.");
  }

  return { memo, model: finalMessage.model };
}
