import { CommercialPageView } from "@/components/seo/commercial-page-view";
import { commercialPages } from "@/lib/seo/commercial";
import { buildPageMetadata } from "@/lib/seo/types";

const page = commercialPages["design-approval-software"];

export const metadata = buildPageMetadata({
  title: page.title,
  description: page.description,
  path: page.path,
  keywords: page.keywords,
});

export default function DesignApprovalSoftwarePage() {
  return <CommercialPageView page={page} />;
}
