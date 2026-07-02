import "dotenv/config";
import { readFile } from "node:fs/promises";
import { lookupCompanyRegistration } from "./lib/registry.js";
import { runDeepResearch } from "./lib/research.js";
import { structureBrief, renderBriefMarkdown } from "./lib/brief.js";
import { saveBrief } from "./lib/storage.js";
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

async function researchOne(input: ResearchInput): Promise<Brief> {
  console.log(`\n=== Researching: ${input.companyName} ===`);

  const registration = input.website ? await lookupCompanyRegistration(input.website) : null;
  if (registration) console.log(`Registration found: ${registration.type ?? "?"} ${registration.number ?? ""}`);

  console.log("Running deep research (this can take 1-3 minutes)...");
  const { memo, model } = await runDeepResearch(input, registration, (delta) => process.stdout.write(delta));
  console.log(`\n\nResearch complete (model: ${model}). Structuring brief...`);

  const brief = await structureBrief(input, registration, memo);
  const markdown = renderBriefMarkdown(brief, new Date().toISOString());
  const saved = await saveBrief(brief, markdown);

  console.log(`\nSaved brief: briefs/${saved.id}.md`);
  console.log(`Fit: ${brief.fit.level} | Confidence: ${brief.confidence}`);
  console.log(`Opening line: ${brief.openingLines[0] ?? "(none)"}`);
  return brief;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.csv) {
    const text = await readFile(args.csv, "utf-8");
    const leads = parseCsv(text);
    console.log(`Loaded ${leads.length} leads from ${args.csv}`);
    const results: { name: string; brief: Brief }[] = [];
    for (const lead of leads) {
      try {
        results.push({ name: lead.companyName, brief: await researchOne(lead) });
      } catch (err) {
        console.error(`Failed to research "${lead.companyName}":`, (err as Error).message);
      }
    }

    // Ranked call list: best fit + confidence first, so the rep knows whom to call first.
    const rank = { strong: 0, high: 0, medium: 1, weak: 2, low: 2 } as const;
    results.sort(
      (a, b) =>
        rank[a.brief.fit.level] - rank[b.brief.fit.level] ||
        rank[a.brief.confidence] - rank[b.brief.confidence]
    );
    console.log("\n=== Ranked call list ===");
    results.forEach((r, i) => {
      const topSignal = r.brief.signals[0]?.title ?? "(no signals found)";
      console.log(`${i + 1}. ${r.name} [fit: ${r.brief.fit.level}, confidence: ${r.brief.confidence}] - ${topSignal}`);
    });
    return;
  }

  if (!args.name) {
    console.error(
      'Usage: npm run research -- --name "Company A/S" [--url https://company.dk] [--notes "..."]\n' +
        "   or: npm run research -- --csv leads.csv   (columns: name,url,notes)"
    );
    process.exit(1);
  }

  await researchOne({ companyName: args.name, website: args.url, notes: args.notes });
}

main().catch((err) => {
  console.error("Fatal error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
