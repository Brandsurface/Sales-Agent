import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupCompanyRegistration } from "./lib/registry.js";
import { runDeepResearch } from "./lib/research.js";
import { structureBrief, renderBriefMarkdown } from "./lib/brief.js";
import { saveBrief, listBriefs, getBrief } from "./lib/storage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.post("/api/research", async (req, res) => {
  const { companyName, website, notes } = req.body ?? {};

  if (!companyName || typeof companyName !== "string") {
    res.status(400).json({ error: "companyName is required" });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({
      error: "ANTHROPIC_API_KEY is not configured on the server. Add it to .env and restart.",
    });
    return;
  }

  try {
    const input = { companyName, website: website || undefined, notes: notes || undefined };
    const registration = await lookupCompanyRegistration(input.website);
    const { memo } = await runDeepResearch(input, registration);
    const brief = await structureBrief(input, registration, memo);
    const researchedAt = new Date().toISOString();
    const markdown = renderBriefMarkdown(brief, researchedAt);
    const saved = await saveBrief(brief, markdown);

    res.json({ id: saved.id, brief, markdown, memo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Research failed" });
  }
});

app.get("/api/briefs", async (_req, res) => {
  res.json(await listBriefs());
});

app.get("/api/briefs/:id", async (req, res) => {
  const record = await getBrief(req.params.id);
  if (!record) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(record);
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`Sales-Agent running at http://localhost:${port}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn("ANTHROPIC_API_KEY is not set - copy .env.example to .env and add your key.");
  }
});
