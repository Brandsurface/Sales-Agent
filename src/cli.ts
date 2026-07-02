import "dotenv/config";
import { readFile } from "node:fs/promises";
import { lookupCvr } from "./lib/cvr.js";
import { runDeepResearch } from "./lib/research.js";
import { structureBrief, renderBriefMarkdown } from "./lib/brief.js";
import { saveBrief } from "./lib/storage.js";
import type { ResearchInput } from "./lib/types.js";

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

async function researchOne(input: ResearchInput): Promise<void> {
  console.log(`\n=== Researching: ${input.companyName} ===`);

  const cvr = await lookupCvr(input.companyName);
  if (cvr) console.log(`CVR match found: ${cvr.number ?? "?"} - ${cvr.industryText ?? ""}`);

  console.log("Running deep research (this can take 30-90s)...");
  const { memo, model } = await runDeepResearch(input, cvr, (delta) => process.stdout.write(delta));
  console.log(`\n\nResearch complete (model: ${model}). Structuring brief...`);

  const brief = await structureBrief(input, cvr, memo);
  const markdown = renderBriefMarkdown(brief, new Date().toISOString());
  const saved = await saveBrief(brief, markdown);

  console.log(`\nSaved brief: briefs/${saved.id}.md`);
  console.log(`Confidence: ${brief.confidence}`);
  console.log(`Opening line: ${brief.openingLine}`);
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
    for (const lead of leads) {
      try {
        await researchOne(lead);
      } catch (err) {
        console.error(`Failed to research "${lead.companyName}":`, (err as Error).message);
      }
    }
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
