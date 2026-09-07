import { ResourcePageView } from "@/components/seo/resource-page-view";
import { resourcePages } from "@/lib/seo/resources";
import { buildPageMetadata } from "@/lib/seo/types";

const page = resourcePages["design-approval-checklist"];

export const metadata = buildPageMetadata({
  title: page.title,
  description: page.description,
  path: page.path,
  keywords: page.keywords,
});

export default function DesignApprovalChecklistPage() {
  return <ResourcePageView page={page} />;
}
