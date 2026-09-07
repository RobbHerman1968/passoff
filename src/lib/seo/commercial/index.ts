import {
  clientApprovalSoftware,
  designApprovalSoftware,
} from "@/lib/seo/commercial/design-and-client";
import {
  approvalWorkflowForAgencies,
  figmaDesignApproval,
  websiteDesignApproval,
} from "@/lib/seo/commercial/figma-website-agency";
import type { CommercialPageContent, CommercialPageId } from "@/lib/seo/types";

export const commercialPages: Record<CommercialPageId, CommercialPageContent> = {
  "design-approval-software": designApprovalSoftware,
  "client-approval-software": clientApprovalSoftware,
  "figma-design-approval": figmaDesignApproval,
  "website-design-approval": websiteDesignApproval,
  "approval-workflow-for-agencies": approvalWorkflowForAgencies,
};

export const commercialPageList = Object.values(commercialPages);
