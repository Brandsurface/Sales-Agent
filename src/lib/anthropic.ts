import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your Anthropic API key."
    );
  }
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

export const RESEARCH_MODEL = process.env.ANTHROPIC_RESEARCH_MODEL || "claude-opus-4-8";
export const BRIEF_MODEL = process.env.ANTHROPIC_BRIEF_MODEL || "claude-sonnet-5";

export const DEFAULT_RESEARCH_MAX_TOKENS = Number(process.env.ANTHROPIC_RESEARCH_MAX_TOKENS) || 24000;
export const DEFAULT_BRIEF_MAX_TOKENS = Number(process.env.ANTHROPIC_BRIEF_MAX_TOKENS) || 8000;

/**
 * Selectable models for the UI/CLI. Kept as an allowlist rather than accepting an
 * arbitrary client-supplied string, so a typo or bad input fails fast/validated rather
 * than burning a request on an invalid model ID.
 */
export const AVAILABLE_MODELS = [
  { id: "claude-opus-4-8", label: "Opus 4.8 (bedst, dyrest)" },
  { id: "claude-sonnet-5", label: "Sonnet 5 (balanceret)" },
  { id: "claude-haiku-4-5", label: "Haiku 4.5 (billigst/hurtigst - til test)" },
] as const;

export function isValidModel(model: unknown): model is string {
  return typeof model === "string" && AVAILABLE_MODELS.some((m) => m.id === model);
}

const MIN_MAX_TOKENS = 1024;
const MAX_MAX_TOKENS = 64000;

/** Clamps a client-supplied max_tokens value into a sane range, or returns the default. */
export function resolveMaxTokens(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(Math.round(n), MIN_MAX_TOKENS), MAX_MAX_TOKENS);
}

/** Published per-model pricing, USD per million tokens (standard rates, not any temporary
 * intro pricing) - used only for the rough cost estimate in logUsage below. */
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

export interface AnthropicUsageLike {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** Best-effort cost estimate in USD. Cache reads are ~10% of the input rate, cache writes
 * ~1.25x - both approximated here since the API doesn't return a dollar figure directly. */
export function estimateCostUsd(model: string, usage: AnthropicUsageLike | undefined): number | null {
  const pricing = MODEL_PRICING[model];
  if (!pricing || !usage) return null;
  const input = (usage.input_tokens || 0) * pricing.input;
  const cacheRead = (usage.cache_read_input_tokens || 0) * pricing.input * 0.1;
  const cacheWrite = (usage.cache_creation_input_tokens || 0) * pricing.input * 1.25;
  const output = (usage.output_tokens || 0) * pricing.output;
  return (input + cacheRead + cacheWrite + output) / 1_000_000;
}

/** Logs token usage + a rough USD estimate for one API call, so cost can be diagnosed from
 * the server logs instead of guessed at. */
export function logUsage(label: string, model: string, usage: AnthropicUsageLike | undefined): void {
  if (!usage) return;
  const cost = estimateCostUsd(model, usage);
  const costStr = cost !== null ? `~$${cost.toFixed(3)}` : "ukendt model-pris";
  console.log(
    `[usage] ${label} (${model}): input=${usage.input_tokens ?? 0} output=${usage.output_tokens ?? 0} ` +
      `cache_write=${usage.cache_creation_input_tokens ?? 0} cache_read=${usage.cache_read_input_tokens ?? 0} ${costStr}`
  );
}
