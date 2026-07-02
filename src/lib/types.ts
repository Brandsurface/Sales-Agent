import { z } from "zod";

export const RegistryInfoSchema = z.object({
  number: z.string().nullable().describe("The legal registration number, e.g. a Danish CVR or German HRB number"),
  type: z
    .string()
    .nullable()
    .describe("What kind of registration this is and which country, e.g. 'CVR (Denmark)' or 'Handelsregister (Germany)'"),
  authority: z.string().nullable().describe("Registering court/authority if stated, e.g. a German Registergericht"),
  vatId: z.string().nullable().describe("VAT/tax ID if found, e.g. a German USt-IdNr or EU VAT number"),
  address: z.string().nullable(),
  sourceUrl: z.string().nullable().describe("The page this was found on (usually an imprint/legal notice page)"),
});
export type RegistryInfo = z.infer<typeof RegistryInfoSchema>;

export const SignalSchema = z.object({
  title: z.string().describe("Short name for the signal, e.g. 'New oat-milk line launch'"),
  description: z.string().describe("What was found, in plain language"),
  whyForExemplar: z
    .string()
    .describe("Why this specifically matters for Exemplar's packaging mockup business"),
  relevantService: z
    .string()
    .describe(
      "Which Exemplar service ties to this signal: label mockups, doypack mockups, can mockups, POS displays, cartonage mockups, shrink wrap, or custom packaging"
    ),
  sourceTitle: z.string().describe("Title of the source article/page"),
  sourceUrl: z.string().describe("URL of the source"),
  sourceDate: z.string().nullable().describe("Publish date of the source if known, else null"),
});
export type Signal = z.infer<typeof SignalSchema>;

export const DecisionMakerSchema = z.object({
  name: z.string().nullable().describe("Name if found, else null"),
  title: z.string().describe("Role/title, e.g. 'Packaging Manager' or 'Indkøbschef'"),
  howToFind: z
    .string()
    .describe("How to reach or confirm this person, e.g. a LinkedIn search or the switchboard department to ask for"),
});
export type DecisionMaker = z.infer<typeof DecisionMakerSchema>;

export const BriefSchema = z.object({
  company: z.object({
    name: z.string(),
    website: z.string(),
    registration: RegistryInfoSchema.nullable(),
  }),
  summary: z
    .string()
    .describe("2-4 sentence snapshot of what the company does and what packaging is currently visible in use"),
  signals: z
    .array(SignalSchema)
    .describe("3-6 concrete, cited, prioritized signals that justify a call now"),
  decisionMakers: z.array(DecisionMakerSchema),
  openingLine: z.string().describe("A concrete, specific suggested opening line for the call"),
  followUpQuestions: z.array(z.string()),
  confidence: z
    .enum(["high", "medium", "low"])
    .describe("How solid/recent the found signals are overall"),
});
export type Brief = z.infer<typeof BriefSchema>;

export interface ResearchInput {
  companyName: string;
  website?: string;
  notes?: string;
}
