import { approvalStateLabel } from "@/lib/approvals/status";
import type { GuestApprovalOffer } from "@/lib/approvals/types";

/** What the website embed is told about approval. Contains nothing a guest shouldn’t see. */
export type SdkApprovalView = {
  visibleState: GuestApprovalOffer["status"]["visibleState"];
  /** Plain-language status, e.g. "Waiting for approval on v1.4". */
  statusLabel: string;
  versionLabel: string;
  canDecide: boolean;
  blockedReason: GuestApprovalOffer["blockedReason"];
  /** Present only when this exact link can decide right now. */
  request: {
    id: string;
    deploymentId: string;
    versionLabel: string;
    requesterDisplayName: string;
    message: string | null;
  } | null;
};

export function toSdkApprovalView(offer: GuestApprovalOffer): SdkApprovalView {
  const { status } = offer;
  const lastApproved = status.history.find((row) => row.state === "approved");
  const request = status.activeRequest;
  return {
    visibleState: status.visibleState,
    statusLabel: approvalStateLabel({
      state: status.visibleState,
      currentVersionLabel: status.currentVersionLabel,
      approvedVersionLabel: lastApproved?.versionLabel,
    }),
    versionLabel: status.currentVersionLabel,
    canDecide: offer.canDecide && Boolean(request),
    blockedReason: offer.blockedReason,
    request:
      offer.canDecide && request
        ? {
            id: request.id,
            deploymentId: status.currentDeploymentId,
            versionLabel: request.versionLabel,
            requesterDisplayName: request.requesterDisplayName,
            message: request.message,
          }
        : null,
  };
}
