import { z } from "zod";

export const behavioralAiResultSchema = z
  .object({
    observedFacts: z.array(z.string().min(1).max(400)).min(1).max(8),
    possibleExplanations: z.array(z.string().min(1).max(400)).min(1).max(8),
    missingInformation: z.array(z.string().min(1).max(400)).min(1).max(8),
    suggestedInvestigationSteps: z.array(z.string().min(1).max(400)).min(1).max(8),
    suggestedVerificationSteps: z.array(z.string().min(1).max(400)).min(1).max(8),
    confidence: z.enum(["low", "medium", "high"]),
    limitations: z.string().min(1).max(800),
  })
  .strict();

export type BehavioralAiResult = z.infer<typeof behavioralAiResultSchema>;

export const FORBIDDEN_AI_INPUT_KEYS = [
  "rawEvents",
  "ip",
  "email",
  "tabSession",
  "screenshot",
  "privateComment",
  "cookie",
  "token",
  "userId",
  "accountId",
  "formValues",
  "fullDom",
  "stackTrace",
  "guestToken",
  "storageKey",
] as const;
