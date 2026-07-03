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
