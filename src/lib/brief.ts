import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { getClient, BRIEF_MODEL } from "./anthropic.js";
import { structuringSystemPrompt } from "./prompts.js";
import { BriefSchema, type Brief, type CvrInfo, type ResearchInput } from "./types.js";

/**
 * Phase 2: turn the free-text research memo into a structured, consistently shaped brief.
 * Runs on a cheaper model with no tools - this is pure formatting of already-gathered facts.
 */
export async function structureBrief(
  input: ResearchInput,
  cvr: CvrInfo | null,
  memo: string
): Promise<Brief> {
  const client = getClient();

  const response = await client.messages.parse({
    model: BRIEF_MODEL,
    max_tokens: 4000,
    system: structuringSystemPrompt(),
    output_config: { format: zodOutputFormat(BriefSchema) },
    messages: [
      {
        role: "user",
        content: `Company: ${input.companyName}\nWebsite: ${input.website || "unknown"}\n\nResearch memo:\n\n${memo}`,
      },
    ],
  });

  if (!response.parsed_output) {
    throw new Error("Failed to parse a structured brief from the research memo.");
  }

  const brief = response.parsed_output;
  // Trust our own inputs over anything the model may have paraphrased.
  brief.company.name = input.companyName;
  brief.company.website = input.website || brief.company.website;
  brief.company.cvr = cvr;
  return brief;
}

export function renderBriefMarkdown(brief: Brief, researchedAt: string): string {
  const lines: string[] = [];
  lines.push(`# Call Brief: ${brief.company.name}`);
  lines.push("");
  lines.push(`*Researched ${researchedAt} - confidence: **${brief.confidence}***`);
  lines.push("");
  lines.push(`**Website:** ${brief.company.website}`);
  if (brief.company.cvr) {
    const c = brief.company.cvr;
    const parts = [
      c.number ? `CVR ${c.number}` : null,
      c.industryText,
      c.employeesRange ? `${c.employeesRange} employees` : null,
      c.founded ? `founded ${c.founded}` : null,
      c.address,
    ].filter(Boolean);
    if (parts.length > 0) lines.push(`**Firmographics:** ${parts.join(" | ")}`);
  }
  lines.push("");
  lines.push("## Snapshot");
  lines.push(brief.summary);
  lines.push("");
  lines.push("## Signals - why call now");
  brief.signals.forEach((s, i) => {
    lines.push(`### ${i + 1}. ${s.title}`);
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
  lines.push("## Suggested opening line");
  lines.push(`> ${brief.openingLine}`);
  lines.push("");
  lines.push("## Follow-up questions");
  brief.followUpQuestions.forEach((q) => lines.push(`- ${q}`));
  lines.push("");
  return lines.join("\n");
}
