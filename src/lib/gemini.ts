import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { finalizeBrief } from "./brief.js";
import { researchSystemPrompt, structuringSystemPrompt } from "./prompts.js";
import { BriefSchema, type Brief, type RegistryInfo, type ResearchInput } from "./types.js";

let client: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      "GEMINI_API_KEY is not set. Get a free key at https://aistudio.google.com/apikey and add it to .env."
    );
  }
  if (!client) {
    client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return client;
}

export const GEMINI_RESEARCH_MODEL = process.env.GEMINI_RESEARCH_MODEL || "gemini-3.5-flash";
export const GEMINI_BRIEF_MODEL = process.env.GEMINI_BRIEF_MODEL || "gemini-3.5-flash";

export const DEFAULT_GEMINI_RESEARCH_MAX_TOKENS = Number(process.env.GEMINI_RESEARCH_MAX_TOKENS) || 24000;
export const DEFAULT_GEMINI_BRIEF_MAX_TOKENS = Number(process.env.GEMINI_BRIEF_MAX_TOKENS) || 8000;

export const AVAILABLE_GEMINI_MODELS = [
  { id: "gemini-3.5-flash", label: "Gemini 3.5 Flash (nyeste, gratis tier)" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (stabil, gratis tier)" },
  { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite (hurtigst/billigst)" },
] as const;

export function isValidGeminiModel(model: unknown): model is string {
  return typeof model === "string" && AVAILABLE_GEMINI_MODELS.some((m) => m.id === model);
}

export interface GeminiResearchResult {
  memo: string;
  model: string;
}

/**
 * Phase 1 via Gemini: uses the built-in googleSearch grounding tool instead of Claude's
 * web_search. Unlike the Claude path this is a single call - Gemini's grounding runs its
 * own search loop server-side within one request, with no pause/resume equivalent to
 * handle. Reuses the exact same system prompt as the Claude path (prompts.ts is
 * provider-agnostic), so research quality/instructions stay in sync across both providers.
 */
export async function runDeepResearchGemini(
  input: ResearchInput,
  registration: RegistryInfo | null,
  options: { model?: string; maxTokens?: number } = {}
): Promise<GeminiResearchResult> {
  const ai = getGeminiClient();
  const model = options.model || GEMINI_RESEARCH_MODEL;
  const maxOutputTokens = options.maxTokens || DEFAULT_GEMINI_RESEARCH_MAX_TOKENS;
  const today = new Date().toISOString().slice(0, 10);

  const registrationBlock = registration
    ? `\n\nCompany registration data already found on the company's own website (trust this, no need to re-find it):\n${JSON.stringify(registration, null, 2)}`
    : input.website
      ? `\n\nNo company registration number was found automatically. If you can, search for the official registration number (e.g. Danish CVR, German Handelsregister/HRB, Norwegian/Swedish Org.nr, or an EU VAT ID) on ${input.website}'s own legal/imprint page, and report it with the source if found.`
      : "";

  const userPrompt = `Research this prospect company for Exemplar's sales team:

Company name: ${input.companyName}
Website: ${input.website || "(not provided - find it)"}
${input.notes ? `Additional notes from the sales rep: ${input.notes}` : ""}${registrationBlock}

Dig deep. Find concrete, current, cited signals per the taxonomy in your instructions.`;

  const response = await ai.models.generateContent({
    model,
    contents: userPrompt,
    config: {
      systemInstruction: researchSystemPrompt(today),
      maxOutputTokens,
      tools: [{ googleSearch: {} }],
    },
  });

  const text = response.text;
  if (!text || !text.trim()) {
    throw new Error("Gemini research call returned no text content.");
  }

  // Gemini doesn't reliably paste raw URLs inline the way we instruct it to - append the
  // actual grounding sources it used so citations stay concrete and checkable.
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  const sources = chunks
    .map((c) => c.web)
    .filter((w): w is { uri: string; title?: string } => Boolean(w?.uri))
    .map((w) => `- [${w.title || w.uri}](${w.uri})`);

  const memo = sources.length > 0 ? `${text}\n\n## Sources used by Google Search grounding\n${sources.join("\n")}` : text;

  return { memo, model };
}

async function callStructuringGemini(
  input: ResearchInput,
  memo: string,
  maxOutputTokens: number,
  model: string
): Promise<Brief> {
  const ai = getGeminiClient();

  const response = await ai.models.generateContent({
    model,
    contents: `Company: ${input.companyName}\nWebsite: ${input.website || "unknown"}\n\nResearch memo:\n\n${memo}`,
    config: {
      systemInstruction: structuringSystemPrompt(),
      maxOutputTokens,
      responseMimeType: "application/json",
      // Reuses the same Zod schema as the Claude path as the single source of truth,
      // converted to plain JSON Schema (a documented-supported subset for this field).
      responseJsonSchema: z.toJSONSchema(BriefSchema),
      // Structuring is pure transcription, not reasoning - disable thinking so it can't
      // silently eat into the same output-token budget as the JSON itself (the same class
      // of bug that caused truncated/unparseable JSON on the Claude path).
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  if (response.candidates?.[0]?.finishReason === "MAX_TOKENS") {
    throw new Error(`Structuring output was cut off at max_tokens=${maxOutputTokens} before finishing.`);
  }

  const text = response.text;
  if (!text) {
    throw new Error("Gemini structuring call returned no text content.");
  }

  return BriefSchema.parse(JSON.parse(text));
}

/**
 * Phase 2 via Gemini: same retry-on-truncation strategy as the Claude path, and the same
 * finalizeBrief post-processing (trust our own inputs, prefer the pre-fetched registration
 * lookup, sort signals strongest-first).
 */
export async function structureBriefGemini(
  input: ResearchInput,
  registration: RegistryInfo | null,
  memo: string,
  options: { model?: string; maxTokens?: number } = {}
): Promise<Brief> {
  const model = options.model || GEMINI_BRIEF_MODEL;
  const baseMaxTokens = options.maxTokens || DEFAULT_GEMINI_BRIEF_MAX_TOKENS;

  let brief: Brief;
  try {
    brief = await callStructuringGemini(input, memo, baseMaxTokens, model);
  } catch (err) {
    console.warn("Gemini structuring failed, retrying with a larger token budget:", (err as Error).message);
    brief = await callStructuringGemini(input, memo, baseMaxTokens * 2, model);
  }
  return finalizeBrief(brief, input, registration);
}
