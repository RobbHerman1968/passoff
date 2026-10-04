import type {
  AnalysisSource,
  AnalysisStatus,
  EvidenceSummary,
  WebsiteAnalysisResult,
} from "@/lib/website-analysis/schema";

export type WebsiteAnalysisPublic = {
  id: string;
  status: AnalysisStatus;
  source: AnalysisSource | null;
  result: WebsiteAnalysisResult | null;
  evidenceSummary: EvidenceSummary | null;
  modelId: string | null;
  cached: boolean;
  tailoredAvailable: boolean;
  message: string | null;
  completedAt: string | null;
};
