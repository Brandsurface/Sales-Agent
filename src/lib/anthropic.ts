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
