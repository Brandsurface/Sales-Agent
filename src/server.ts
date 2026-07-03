import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupCompanyRegistration } from "./lib/registry.js";
import { runDeepResearch } from "./lib/research.js";
import { structureBrief, renderBriefMarkdown } from "./lib/brief.js";
import { saveBrief, saveRawMemo, listBriefs, getBrief } from "./lib/storage.js";
import { AVAILABLE_MODELS, isValidModel, resolveMaxTokens, DEFAULT_RESEARCH_MAX_TOKENS, DEFAULT_BRIEF_MAX_TOKENS } from "./lib/anthropic.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/models", (_req, res) => {
  res.json({
    models: AVAILABLE_MODELS,
    defaults: {
      researchMaxTokens: DEFAULT_RESEARCH_MAX_TOKENS,
      briefMaxTokens: DEFAULT_BRIEF_MAX_TOKENS,
    },
  });
});

app.post("/api/research", async (req, res) => {
  const { companyName, website, notes, model, researchMaxTokens, briefMaxTokens } = req.body ?? {};

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

  // Client-supplied model/max_tokens are optional overrides - fall back to env defaults
  // when absent or invalid, so a stray bad value never breaks the request.
  const resolvedModel = isValidModel(model) ? model : undefined;
  const resolvedResearchMaxTokens = resolveMaxTokens(researchMaxTokens, DEFAULT_RESEARCH_MAX_TOKENS);
  const resolvedBriefMaxTokens = resolveMaxTokens(briefMaxTokens, DEFAULT_BRIEF_MAX_TOKENS);

  const input = { companyName, website: website || undefined, notes: notes || undefined };

  let memo: string;
  try {
    const registration = await lookupCompanyRegistration(input.website);
    const result = await runDeepResearch(input, registration, {
      model: resolvedModel,
      maxTokens: resolvedResearchMaxTokens,
    });
    memo = result.memo;

    try {
      const brief = await structureBrief(input, registration, memo, {
        model: resolvedModel,
        maxTokens: resolvedBriefMaxTokens,
      });
      const researchedAt = new Date().toISOString();
      const markdown = renderBriefMarkdown(brief, researchedAt);
      const saved = await saveBrief(brief, markdown);

      res.json({ id: saved.id, brief, markdown, memo });
    } catch (structuringErr) {
      // Research succeeded (and was paid for) even though structuring failed - never
      // discard the memo, so the rep still gets something for the spend.
      console.error("Structuring failed after research completed:", structuringErr);
      const saved = await saveRawMemo(companyName, memo);
      res.json({
        id: saved.id,
        brief: null,
        markdown: null,
        memo,
        warning:
          "Kunne ikke strukturere svaret automatisk, men den rå research er gemt og vist herunder. " +
          `(${structuringErr instanceof Error ? structuringErr.message : "ukendt fejl"})`,
      });
    }
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
