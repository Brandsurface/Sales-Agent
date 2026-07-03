import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Brief } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRIEFS_DIR = path.join(__dirname, "..", "..", "briefs");

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "company"
  );
}

export interface SavedBriefRecord {
  id: string;
  researchedAt: string;
  brief: Brief;
  markdown: string;
}

export interface BriefListItem {
  id: string;
  companyName: string;
  researchedAt: string;
  confidence: Brief["confidence"];
}

export async function saveBrief(brief: Brief, markdown: string): Promise<SavedBriefRecord> {
  await mkdir(BRIEFS_DIR, { recursive: true });
  const researchedAt = new Date().toISOString();
  const id = `${slugify(brief.company.name)}__${researchedAt.replace(/[:.]/g, "-")}`;

  const record: SavedBriefRecord = { id, researchedAt, brief, markdown };
  await writeFile(path.join(BRIEFS_DIR, `${id}.json`), JSON.stringify(record, null, 2), "utf-8");
  await writeFile(path.join(BRIEFS_DIR, `${id}.md`), markdown, "utf-8");

  return record;
}

/**
 * Fallback save for when the (expensive) research memo was produced but structuring into
 * a Brief failed even after a retry - so a paid-for research call is never simply lost.
 * Saved with a distinct extension so it doesn't show up in the structured-brief history list.
 */
export async function saveRawMemo(companyName: string, memo: string): Promise<{ id: string }> {
  await mkdir(BRIEFS_DIR, { recursive: true });
  const researchedAt = new Date().toISOString();
  const id = `${slugify(companyName)}__${researchedAt.replace(/[:.]/g, "-")}`;
  await writeFile(path.join(BRIEFS_DIR, `${id}.raw.md`), memo, "utf-8");
  return { id };
}

export async function listBriefs(): Promise<BriefListItem[]> {
  await mkdir(BRIEFS_DIR, { recursive: true });
  const files = (await readdir(BRIEFS_DIR)).filter((f) => f.endsWith(".json"));

  const items: BriefListItem[] = [];
  for (const file of files) {
    try {
      const raw = await readFile(path.join(BRIEFS_DIR, file), "utf-8");
      const record = JSON.parse(raw) as SavedBriefRecord;
      items.push({
        id: record.id,
        companyName: record.brief.company.name,
        researchedAt: record.researchedAt,
        confidence: record.brief.confidence,
      });
    } catch {
      // skip unreadable/corrupt files
    }
  }

  return items.sort((a, b) => b.researchedAt.localeCompare(a.researchedAt));
}

export async function getBrief(id: string): Promise<SavedBriefRecord | null> {
  if (!/^[a-z0-9-]+__[0-9TZ-]+$/i.test(id)) return null; // guard against path traversal
  try {
    const raw = await readFile(path.join(BRIEFS_DIR, `${id}.json`), "utf-8");
    return JSON.parse(raw) as SavedBriefRecord;
  } catch {
    return null;
  }
}
