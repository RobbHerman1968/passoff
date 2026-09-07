import {
  clientSignOffTemplate,
  designApprovalChecklist,
} from "@/lib/seo/resources/checklists-and-signoff";
import {
  designApprovalEmailTemplate,
  designFeedbackChecklist,
  websiteHandoffChecklist,
} from "@/lib/seo/resources/feedback-email-handoff";
import type { ResourcePageContent, ResourcePageId } from "@/lib/seo/types";

export const resourcePages: Record<ResourcePageId, ResourcePageContent> = {
  "design-approval-checklist": designApprovalChecklist,
  "client-sign-off-template": clientSignOffTemplate,
  "design-feedback-checklist": designFeedbackChecklist,
  "design-approval-email-template": designApprovalEmailTemplate,
  "website-handoff-checklist": websiteHandoffChecklist,
};

export const resourcePageList = Object.values(resourcePages);
