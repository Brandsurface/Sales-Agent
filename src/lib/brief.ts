import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getClient, BRIEF_MODEL, DEFAULT_BRIEF_MAX_TOKENS, logUsage } from "./anthropic.js";
import { structuringSystemPrompt } from "./prompts.js";
import { BriefSchema, type Brief, type RegistryInfo, type ResearchInput } from "./types.js";

/**
 * Runs the structuring call. Thinking is explicitly disabled - this step is pure
 * transcription of facts already established in the memo, not reasoning, and Sonnet 5
 * runs adaptive thinking by default when `thinking` is omitted, which would otherwise
 * silently eat into the same max_tokens budget as the JSON output itself.
 */
async function callStructuring(
  input: ResearchInput,
  memo: string,
  maxTokens: number,
  model: string
): Promise<Brief> {
  const client = getClient();

  const response = await client.messages.parse({
    model,
    max_tokens: maxTokens,
    thinking: { type: "disabled" },
    system: structuringSystemPrompt(),
    output_config: { format: zodOutputFormat(BriefSchema) },
    messages: [
      {
        role: "user",
        content: `Company: ${input.companyName}\nWebsite: ${input.website || "unknown"}\n\nResearch memo:\n\n${memo}`,
      },
    ],
  });

  logUsage(`structuring (stop=${response.stop_reason})`, model, response.usage);

  if (response.stop_reason === "max_tokens") {
    throw new Error(`Structuring output was cut off at max_tokens=${maxTokens} before finishing.`);
  }

  if (!response.parsed_output) {
    throw new Error("Failed to parse a structured brief from the research memo.");
  }

  return response.parsed_output;
}

/**
 * Phase 2: turn the free-text research memo into a structured, consistently shaped brief.
 * Runs on a cheaper model with no tools - this is pure formatting of already-gathered facts.
 * Retries once with a bigger token budget on failure so a truncated JSON response doesn't
 * throw away an already-paid-for research memo (callers should still have a raw-memo
 * fallback for the rare case both attempts fail - see server.ts/cli.ts).
 */
export async function structureBrief(
  input: ResearchInput,
  registration: RegistryInfo | null,
  memo: string,
  options: { model?: string; maxTokens?: number } = {}
): Promise<Brief> {
  const model = options.model || BRIEF_MODEL;
  const baseMaxTokens = options.maxTokens || DEFAULT_BRIEF_MAX_TOKENS;

  let brief: Brief;
  try {
    brief = await callStructuring(input, memo, baseMaxTokens, model);
  } catch (err) {
    // Truncation is often transient / schema-size-dependent - one retry with a much
    // larger budget is cheap insurance against losing an already-paid-for research memo.
    console.warn("Structuring failed, retrying with a larger token budget:", (err as Error).message);
    brief = await callStructuring(input, memo, baseMaxTokens * 2, model);
  }
  return finalizeBrief(brief, input, registration);
}

/**
 * Shared post-processing for a freshly-parsed Brief, regardless of which provider produced
 * it: trust our own inputs over anything the model may have paraphrased, prefer the
 * pre-fetched registration lookup over whatever the model may have found itself, and sort
 * signals strongest-first.
 */
export function finalizeBrief(brief: Brief, input: ResearchInput, registration: RegistryInfo | null): Brief {
  brief.company.name = input.companyName;
  brief.company.website = input.website || brief.company.website;
  brief.company.registration = registration ?? brief.company.registration;
  const strengthRank = { strong: 0, medium: 1, weak: 2 } as const;
  brief.signals.sort((a, b) => strengthRank[a.strength] - strengthRank[b.strength]);
  return brief;
}

export function renderBriefMarkdown(brief: Brief, researchedAt: string): string {
  const lines: string[] = [];
  lines.push(`# Call Brief: ${brief.company.name}`);
  lines.push("");
  lines.push(`*Researched ${researchedAt} - confidence: **${brief.confidence}***`);
  lines.push("");
  lines.push(`**Website:** ${brief.company.website}`);
  if (brief.company.registration) {
    const r = brief.company.registration;
    const parts = [
      r.type && r.number ? `${r.type}: ${r.number}` : r.number,
      r.vatId ? `VAT ${r.vatId}` : null,
      r.authority,
      r.address,
    ].filter(Boolean);
    if (parts.length > 0) {
      const sourceSuffix = r.sourceUrl ? ` ([source](${r.sourceUrl}))` : "";
      lines.push(`**Registration:** ${parts.join(" | ")}${sourceSuffix}`);
    }
  }
  lines.push("");
  lines.push("## Snapshot");
  lines.push(brief.summary);
  lines.push("");
  lines.push(`## Fit: ${brief.fit.level}`);
  lines.push(brief.fit.rationale);
  lines.push("");
  lines.push("## Signals - why call now (strongest first)");
  brief.signals.forEach((s, i) => {
    lines.push(`### ${i + 1}. ${s.title} [${s.strength}]`);
    lines.push(s.description);
    lines.push(`- **Why it matters for Exemplar:** ${s.whyForExemplar}`);
    lines.push(`- **Relevant service:** ${s.relevantService}`);
    const dateSuffix = s.sourceDate ? ` (${s.sourceDate})` : "";
    lines.push(`- **Source:** [${s.sourceTitle}](${s.sourceUrl})${dateSuffix}`);
    lines.push("");
  });
  lines.push("## Who to ask for");
  if (brief.decisionMakers.length === 0) {
    lines.push("No specific contact identified.");
  } else {
    brief.decisionMakers.forEach((d) => {
      lines.push(`- ${d.name ? `**${d.name}** - ` : ""}${d.title} (${d.howToFind})`);
    });
  }
  lines.push("");
  lines.push("## Suggested opening lines");
  brief.openingLines.forEach((line) => lines.push(`> ${line}`, ""));
  lines.push("## Follow-up questions");
  brief.followUpQuestions.forEach((q) => lines.push(`- ${q}`));
  lines.push("");
  return lines.join("\n");
}
