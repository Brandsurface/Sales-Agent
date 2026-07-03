import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lookupCompanyRegistration } from "./lib/registry.js";
import { runDeepResearch } from "./lib/research.js";
import { structureBrief, renderBriefMarkdown } from "./lib/brief.js";
import { runDeepResearchGemini, structureBriefGemini } from "./lib/gemini.js";
import { saveBrief, saveRawMemo, listBriefs, getBrief } from "./lib/storage.js";
import {
  AVAILABLE_MODELS,
  isValidModel,
  resolveMaxTokens,
  DEFAULT_RESEARCH_MAX_TOKENS,
  DEFAULT_BRIEF_MAX_TOKENS,
} from "./lib/anthropic.js";
import {
  AVAILABLE_GEMINI_MODELS,
  isValidGeminiModel,
  DEFAULT_GEMINI_RESEARCH_MAX_TOKENS,
  DEFAULT_GEMINI_BRIEF_MAX_TOKENS,
} from "./lib/gemini.js";
import type { RegistryInfo, ResearchInput, Brief } from "./lib/types.js";

type Provider = "anthropic" | "gemini";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.get("/api/models", (_req, res) => {
  res.json({
    providers: {
      anthropic: {
        label: "Claude (Anthropic)",
        available: Boolean(process.env.ANTHROPIC_API_KEY),
        models: AVAILABLE_MODELS,
        defaults: { researchMaxTokens: DEFAULT_RESEARCH_MAX_TOKENS, briefMaxTokens: DEFAULT_BRIEF_MAX_TOKENS },
      },
      gemini: {
        label: "Gemini (Google, gratis tier til test)",
        available: Boolean(process.env.GEMINI_API_KEY),
        models: AVAILABLE_GEMINI_MODELS,
        defaults: {
          researchMaxTokens: DEFAULT_GEMINI_RESEARCH_MAX_TOKENS,
          briefMaxTokens: DEFAULT_GEMINI_BRIEF_MAX_TOKENS,
        },
      },
    },
  });
});

async function runResearchPhase(
  provider: Provider,
  input: ResearchInput,
  registration: RegistryInfo | null,
  model: string | undefined,
  maxTokens: number
): Promise<{ memo: string }> {
  if (provider === "gemini") {
    return runDeepResearchGemini(input, registration, { model, maxTokens });
  }
  return runDeepResearch(input, registration, { model, maxTokens });
}

async function runStructuringPhase(
  provider: Provider,
  input: ResearchInput,
  registration: RegistryInfo | null,
  memo: string,
  model: string | undefined,
  maxTokens: number
): Promise<Brief> {
  if (provider === "gemini") {
    return structureBriefGemini(input, registration, memo, { model, maxTokens });
  }
  return structureBrief(input, registration, memo, { model, maxTokens });
}

app.post("/api/research", async (req, res) => {
  const { companyName, website, notes, provider, model, researchMaxTokens, briefMaxTokens } = req.body ?? {};

  if (!companyName || typeof companyName !== "string") {
    res.status(400).json({ error: "companyName is required" });
    return;
  }

  const resolvedProvider: Provider = provider === "gemini" ? "gemini" : "anthropic";
  const apiKeyEnvVar = resolvedProvider === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY";

  if (!process.env[apiKeyEnvVar]) {
    res.status(500).json({
      error: `${apiKeyEnvVar} is not configured on the server. Add it to .env and restart.`,
    });
    return;
  }

  // Client-supplied model/max_tokens are optional overrides - fall back to env defaults
  // when absent or invalid, so a stray bad value never breaks the request.
  const isValid = resolvedProvider === "gemini" ? isValidGeminiModel : isValidModel;
  const resolvedModel = isValid(model) ? model : undefined;
  const defaultResearchMaxTokens =
    resolvedProvider === "gemini" ? DEFAULT_GEMINI_RESEARCH_MAX_TOKENS : DEFAULT_RESEARCH_MAX_TOKENS;
  const defaultBriefMaxTokens = resolvedProvider === "gemini" ? DEFAULT_GEMINI_BRIEF_MAX_TOKENS : DEFAULT_BRIEF_MAX_TOKENS;
  const resolvedResearchMaxTokens = resolveMaxTokens(researchMaxTokens, defaultResearchMaxTokens);
  const resolvedBriefMaxTokens = resolveMaxTokens(briefMaxTokens, defaultBriefMaxTokens);

  const input = { companyName, website: website || undefined, notes: notes || undefined };

  try {
    const registration = await lookupCompanyRegistration(input.website);
    const { memo } = await runResearchPhase(
      resolvedProvider,
      input,
      registration,
      resolvedModel,
      resolvedResearchMaxTokens
    );

    try {
      const brief = await runStructuringPhase(
        resolvedProvider,
        input,
        registration,
        memo,
        resolvedModel,
        resolvedBriefMaxTokens
      );
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
  if (!process.env.GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY is not set - Gemini provider unavailable until you add one (optional).");
  }
});
