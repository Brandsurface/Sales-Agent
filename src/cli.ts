import "dotenv/config";
import { readFile } from "node:fs/promises";
import { lookupCompanyRegistration } from "./lib/registry.js";
import { runDeepResearch } from "./lib/research.js";
import { structureBrief, renderBriefMarkdown } from "./lib/brief.js";
import { saveBrief, saveRawMemo } from "./lib/storage.js";
import { AVAILABLE_MODELS, isValidModel, resolveMaxTokens, DEFAULT_RESEARCH_MAX_TOKENS, DEFAULT_BRIEF_MAX_TOKENS } from "./lib/anthropic.js";
import type { Brief, ResearchInput } from "./lib/types.js";

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = "true";
      }
    }
  }
  return args;
}

interface RunOptions {
  model?: string;
  researchMaxTokens: number;
  briefMaxTokens: number;
}

async function researchOne(input: ResearchInput, opts: RunOptions): Promise<Brief | null> {
  console.log(`\n=== Researching: ${input.companyName} ===`);

  const registration = input.website ? await lookupCompanyRegistration(input.website) : null;
  if (registration) console.log(`Registration found: ${registration.type ?? "?"} ${registration.number ?? ""}`);

  console.log("Running deep research (this can take 1-3 minutes)...");
  const { memo, model } = await runDeepResearch(input, registration, {
    model: opts.model,
    maxTokens: opts.researchMaxTokens,
    onProgress: (delta) => process.stdout.write(delta),
  });
  console.log(`\n\nResearch complete (model: ${model}). Structuring brief...`);

  try {
    const brief = await structureBrief(input, registration, memo, {
      model: opts.model,
      maxTokens: opts.briefMaxTokens,
    });
    const markdown = renderBriefMarkdown(brief, new Date().toISOString());
    const saved = await saveBrief(brief, markdown);

    console.log(`\nSaved brief: briefs/${saved.id}.md`);
    console.log(`Fit: ${brief.fit.level} | Confidence: ${brief.confidence}`);
    console.log(`Opening line: ${brief.openingLines[0] ?? "(none)"}`);
    return brief;
  } catch (err) {
    // Research already ran (and was paid for) - never lose the memo just because
    // structuring failed.
    const saved = await saveRawMemo(input.companyName, memo);
    console.error(`\nStructuring failed (${(err as Error).message}). Raw memo saved: briefs/${saved.id}.raw.md`);
    return null;
  }
}

/** Minimal CSV parser: one row per line, columns "name,url,notes". No quoted-field support. */
function parseCsv(text: string): ResearchInput[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows = lines[0]?.toLowerCase().startsWith("name") ? lines.slice(1) : lines;
  return rows.map((line) => {
    const [companyName, website, notes] = line.split(",").map((v) => v?.trim());
    return { companyName, website: website || undefined, notes: notes || undefined };
  });
}

function resolveRunOptions(args: Record<string, string>): RunOptions {
  if (args.model && !isValidModel(args.model)) {
    const ids = AVAILABLE_MODELS.map((m) => m.id).join(", ");
    console.warn(`Ukendt model "${args.model}" - falder tilbage til standard. Gyldige valg: ${ids}`);
  }
  return {
    model: isValidModel(args.model) ? args.model : undefined,
    researchMaxTokens: resolveMaxTokens(args["max-tokens"] ?? args["research-max-tokens"], DEFAULT_RESEARCH_MAX_TOKENS),
    briefMaxTokens: resolveMaxTokens(args["brief-max-tokens"], DEFAULT_BRIEF_MAX_TOKENS),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runOptions = resolveRunOptions(args);

  if (args.csv) {
    const text = await readFile(args.csv, "utf-8");
    const leads = parseCsv(text);
    console.log(`Loaded ${leads.length} leads from ${args.csv}`);
    const results: { name: string; brief: Brief | null }[] = [];
    for (const lead of leads) {
      try {
        results.push({ name: lead.companyName, brief: await researchOne(lead, runOptions) });
      } catch (err) {
        console.error(`Failed to research "${lead.companyName}":`, (err as Error).message);
      }
    }

    // Ranked call list: best fit + confidence first, so the rep knows whom to call first.
    // Leads where structuring failed (brief: null) are listed last, flagged for manual review.
    const rank = { strong: 0, high: 0, medium: 1, weak: 2, low: 2 } as const;
    results.sort((a, b) => {
      if (!a.brief && !b.brief) return 0;
      if (!a.brief) return 1;
      if (!b.brief) return -1;
      return rank[a.brief.fit.level] - rank[b.brief.fit.level] || rank[a.brief.confidence] - rank[b.brief.confidence];
    });
    console.log("\n=== Ranked call list ===");
    results.forEach((r, i) => {
      if (!r.brief) {
        console.log(`${i + 1}. ${r.name} [strukturering fejlede - se rå memo i /briefs]`);
        return;
      }
      const topSignal = r.brief.signals[0]?.title ?? "(no signals found)";
      console.log(`${i + 1}. ${r.name} [fit: ${r.brief.fit.level}, confidence: ${r.brief.confidence}] - ${topSignal}`);
    });
    return;
  }

  if (!args.name) {
    console.error(
      'Usage: npm run research -- --name "Company A/S" [--url https://company.dk] [--notes "..."]\n' +
        "                          [--model claude-opus-4-8|claude-sonnet-5|claude-haiku-4-5]\n" +
        "                          [--max-tokens 24000] [--brief-max-tokens 8000]\n" +
        "   or: npm run research -- --csv leads.csv   (columns: name,url,notes)"
    );
    process.exit(1);
  }

  await researchOne({ companyName: args.name, website: args.url, notes: args.notes }, runOptions);
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
