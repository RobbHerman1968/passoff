import { z } from "zod";

import {
  DETECTED_PLATFORMS,
  RECOMMENDED_METHODS,
} from "@/lib/website-analysis/platforms";

export const confidenceSchema = z.enum(["high", "medium", "low"]);

export const websiteAnalysisResultSchema = z.object({
  detectedPlatform: z.enum(DETECTED_PLATFORMS),
  confidence: confidenceSchema,
  evidence: z.array(z.string().min(1).max(240)).max(8),
  recommendedMethod: z.enum(RECOMMENDED_METHODS),
  steps: z.array(z.string().min(1).max(400)).min(1).max(12),
  placement: z.string().min(1).max(400),
  verificationSteps: z.array(z.string().min(1).max(400)).min(1).max(8),
  cautions: z.array(z.string().min(1).max(400)).max(8),
  requiresDeveloper: z.boolean(),
  alternateMethods: z.array(z.enum(RECOMMENDED_METHODS)).max(6),
  existingInstallationDetected: z.boolean(),
  needsClarification: z.boolean(),
  clarificationQuestion: z.string().max(280).nullable(),
});

export type WebsiteAnalysisResult = z.infer<typeof websiteAnalysisResultSchema>;

export const safeHeaderSchema = z.object({
  name: z.string(),
  value: z.string().max(500),
});

export const assetSignalSchema = z.object({
  hostname: z.string().max(253),
  path: z.string().max(200),
  filename: z.string().max(120).nullable(),
});

export const cspSummarySchema = z.object({
  present: z.boolean(),
  scriptSrcHosts: z.array(z.string().max(253)).max(30),
  blocksInlineScripts: z.boolean(),
  restrictsThirdPartyScripts: z.boolean(),
  rawDirectiveNames: z.array(z.string().max(80)).max(20),
});

export const deterministicCandidateSchema = z.object({
  platform: z.enum(DETECTED_PLATFORMS),
  score: z.number().int().min(0).max(100),
  reasons: z.array(z.string().max(200)).max(6),
});

/** Compact evidence sent to OpenAI — never includes full HTML or secrets. */
export const sanitizedEvidenceSchema = z.object({
  normalizedOrigin: z.string().max(300),
  finalUrlOrigin: z.string().max(300),
  contentType: z.string().max(120).nullable(),
  metaGenerator: z.string().max(200).nullable(),
  safeHeaders: z.array(safeHeaderSchema).max(12),
  scriptAssets: z.array(assetSignalSchema).max(40),
  stylesheetAssets: z.array(assetSignalSchema).max(40),
  frameworkMarkers: z.array(z.string().max(80)).max(30),
  cmsMarkers: z.array(z.string().max(80)).max(30),
  hasGoogleTagManager: z.boolean(),
  hasPassoffScript: z.boolean(),
  appearsAuthenticated: z.boolean(),
  appearsClientRendered: z.boolean(),
  reachable: z.boolean(),
  csp: cspSummarySchema,
  deterministicCandidates: z.array(deterministicCandidateSchema).max(8),
  conflictingEvidence: z.array(z.string().max(240)).max(8),
  analyzerWarnings: z.array(z.string().max(240)).max(12),
});

export type SanitizedEvidence = z.infer<typeof sanitizedEvidenceSchema>;

export const evidenceSummarySchema = z.object({
  normalizedOrigin: z.string(),
  finalUrlOrigin: z.string().nullable(),
  metaGenerator: z.string().nullable(),
  hasGoogleTagManager: z.boolean(),
  hasPassoffScript: z.boolean(),
  appearsAuthenticated: z.boolean(),
  appearsClientRendered: z.boolean(),
  reachable: z.boolean(),
  cspPresent: z.boolean(),
  blocksInlineScripts: z.boolean(),
  restrictsThirdPartyScripts: z.boolean(),
  topCandidates: z.array(z.enum(DETECTED_PLATFORMS)).max(5),
  warnings: z.array(z.string()).max(12),
});

export type EvidenceSummary = z.infer<typeof evidenceSummarySchema>;

export const ANALYSIS_SOURCES = [
  "openai",
  "deterministic",
  "cached",
  "manual",
] as const;

export type AnalysisSource = (typeof ANALYSIS_SOURCES)[number];

export const ANALYSIS_STATUSES = [
  "running",
  "succeeded",
  "failed",
  "unreachable",
  "fallback",
] as const;

export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];
