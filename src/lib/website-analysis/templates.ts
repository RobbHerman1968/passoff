import {
  METHOD_LABELS,
  PLATFORM_LABELS,
  type DetectedPlatform,
  type RecommendedMethod,
  platformToDefaultMethod,
} from "@/lib/website-analysis/platforms";
import type { WebsiteAnalysisResult } from "@/lib/website-analysis/schema";

export type InstallationTemplate = {
  method: RecommendedMethod;
  platform: DetectedPlatform;
  requiresDeveloper: boolean;
  placement: string;
  steps: string[];
  verificationSteps: string[];
  cautions: string[];
  alternateMethods: RecommendedMethod[];
};

const SHARED_VERIFICATION = [
  "Open the website in a normal browser tab after the change is live.",
  "Return to Passoff and choose Check installation.",
  "If Passoff is not detected yet, wait a minute, refresh the website, and check again.",
];

const SHARED_SNIPPET_NOTE =
  "Use the Passoff install code shown on this page. Do not invent or rewrite the script.";

export const INSTALLATION_TEMPLATES: Record<
  RecommendedMethod,
  InstallationTemplate
> = {
  generic_html_body: {
    method: "generic_html_body",
    platform: "generic_html",
    requiresDeveloper: false,
    placement:
      "Paste the Passoff install code just before the closing </body> tag on every page that should support review.",
    steps: [
      "Open the HTML template or layout file that wraps the pages you want to review.",
      SHARED_SNIPPET_NOTE,
      "Paste the install code immediately before the closing </body> tag.",
      "Publish or deploy the change, then open the live page once.",
    ],
    verificationSteps: SHARED_VERIFICATION,
    cautions: [
      "If your site uses a content security policy, Passoff may also need to be allowed there.",
    ],
    alternateMethods: ["gtm_custom_html"],
  },
  nextjs_script: {
    method: "nextjs_script",
    platform: "nextjs",
    requiresDeveloper: true,
    placement:
      "Add the Passoff install code in the root layout with next/script so it loads on every page.",
    steps: [
      "Open the root layout file for the Next.js app (often app/layout.tsx or pages/_app.tsx).",
      "Import Script from next/script if it is not already imported.",
      SHARED_SNIPPET_NOTE,
      "Render the Passoff script near the end of the document body so it loads on every route.",
      "Deploy the change to the environment connected to this review.",
    ],
    verificationSteps: SHARED_VERIFICATION,
    cautions: [
      "Load Passoff only in environments you intend to review.",
      "If a content security policy is set, allow the Passoff script host.",
    ],
    alternateMethods: ["gtm_custom_html", "generic_html_body"],
  },
  gtm_custom_html: {
    method: "gtm_custom_html",
    platform: "gtm",
    requiresDeveloper: false,
    placement:
      "Create a Google Tag Manager Custom HTML tag that injects the Passoff install code on the pages you want to review.",
    steps: [
      "Open Google Tag Manager for the website container.",
      "Create a new tag and choose Custom HTML.",
      SHARED_SNIPPET_NOTE,
      "Paste the install code into the Custom HTML field.",
      "Set a trigger for the pages that should support review, then publish the container.",
    ],
    verificationSteps: SHARED_VERIFICATION,
    cautions: [
      "Make sure the tag fires on the exact origin allowed for this review.",
      "If GTM is blocked by a content security policy, Passoff will not load until that policy allows it.",
    ],
    alternateMethods: ["generic_html_body"],
  },
  wordpress_header: {
    method: "wordpress_header",
    platform: "wordpress",
    requiresDeveloper: false,
    placement:
      "Add the Passoff install code site-wide through your theme header settings or an approved script manager.",
    steps: [
      "Open the WordPress admin for this website.",
      "Use your theme’s site-wide header/footer script area, or an approved script manager plugin.",
      SHARED_SNIPPET_NOTE,
      "Paste the install code so it appears on every page that should support review.",
      "Save and clear any page cache if your site uses one.",
    ],
    verificationSteps: SHARED_VERIFICATION,
    cautions: [
      "Prefer a maintained script manager over editing theme files when possible.",
      "Caching plugins can delay detection until the cache refreshes.",
    ],
    alternateMethods: ["gtm_custom_html", "generic_html_body"],
  },
  shopify_theme: {
    method: "shopify_theme",
    platform: "shopify",
    requiresDeveloper: true,
    placement:
      "Add the Passoff install code to the Shopify theme layout that wraps storefront pages.",
    steps: [
      "Open the Shopify theme editor or theme code for the live theme.",
      "Open the main layout file (often theme.liquid).",
      SHARED_SNIPPET_NOTE,
      "Paste the install code just before the closing </body> tag.",
      "Save the theme and open a storefront page once.",
    ],
    verificationSteps: SHARED_VERIFICATION,
    cautions: [
      "Checkout and some system pages may restrict third-party scripts.",
      "Theme updates can overwrite custom layout edits—keep a note of the change.",
    ],
    alternateMethods: ["gtm_custom_html"],
  },
  webflow_custom_code: {
    method: "webflow_custom_code",
    platform: "webflow",
    requiresDeveloper: false,
    placement:
      "Add the Passoff install code in Webflow site-wide custom code before the closing body tag.",
    steps: [
      "Open Webflow site settings for this project.",
      "Go to the site-wide custom code area for the body.",
      SHARED_SNIPPET_NOTE,
      "Paste the install code into the before-</body> custom code field.",
      "Publish the site to the domain connected to this review.",
    ],
    verificationSteps: SHARED_VERIFICATION,
    cautions: [
      "Custom code changes apply after you publish the site.",
    ],
    alternateMethods: ["gtm_custom_html", "generic_html_body"],
  },
  squarespace_code_injection: {
    method: "squarespace_code_injection",
    platform: "squarespace",
    requiresDeveloper: false,
    placement:
      "Add the Passoff install code with Squarespace code injection for the site footer.",
    steps: [
      "Open Squarespace settings for this site.",
      "Open the code injection area for the site footer.",
      SHARED_SNIPPET_NOTE,
      "Paste the install code into the footer injection field.",
      "Save and refresh a live page.",
    ],
    verificationSteps: SHARED_VERIFICATION,
    cautions: [
      "Code injection availability depends on your Squarespace plan.",
    ],
    alternateMethods: ["gtm_custom_html", "generic_html_body"],
  },
  wix_custom_code: {
    method: "wix_custom_code",
    platform: "wix",
    requiresDeveloper: false,
    placement:
      "Add the Passoff install code with Wix custom code so it loads on the relevant pages.",
    steps: [
      "Open the Wix dashboard for this site.",
      "Open custom code settings for the site.",
      SHARED_SNIPPET_NOTE,
      "Add the install code to load in the body on the pages you want to review.",
      "Apply and publish the site.",
    ],
    verificationSteps: SHARED_VERIFICATION,
    cautions: [
      "Confirm the code is set to load on the domain and pages covered by this review.",
    ],
    alternateMethods: ["gtm_custom_html", "generic_html_body"],
  },
  framer_custom_code: {
    method: "framer_custom_code",
    platform: "framer",
    requiresDeveloper: false,
    placement:
      "Add the Passoff install code in Framer custom code for the site end of body.",
    steps: [
      "Open the Framer project settings for this site.",
      "Open the custom code area for the end of the body.",
      SHARED_SNIPPET_NOTE,
      "Paste the install code and save.",
      "Publish the site to the domain connected to this review.",
    ],
    verificationSteps: SHARED_VERIFICATION,
    cautions: [
      "Custom code applies after you publish the Framer site.",
    ],
    alternateMethods: ["gtm_custom_html", "generic_html_body"],
  },
  manual_choice: {
    method: "manual_choice",
    platform: "unknown",
    requiresDeveloper: false,
    placement:
      "Choose the platform that matches how you manage this website, then follow those steps.",
    steps: [
      "Choose the closest platform from the list.",
      "Follow the installation steps for that platform.",
      SHARED_SNIPPET_NOTE,
    ],
    verificationSteps: SHARED_VERIFICATION,
    cautions: [],
    alternateMethods: [
      "generic_html_body",
      "gtm_custom_html",
      "nextjs_script",
      "wordpress_header",
    ],
  },
};

export function getInstallationTemplate(
  method: RecommendedMethod,
): InstallationTemplate {
  return INSTALLATION_TEMPLATES[method];
}

export function buildResultFromTemplate(input: {
  platform: DetectedPlatform;
  method?: RecommendedMethod;
  confidence: WebsiteAnalysisResult["confidence"];
  evidence: string[];
  cautions?: string[];
  existingInstallationDetected?: boolean;
  needsClarification?: boolean;
  clarificationQuestion?: string | null;
  requiresDeveloper?: boolean;
}): WebsiteAnalysisResult {
  const method = input.method ?? platformToDefaultMethod(input.platform);
  const template = getInstallationTemplate(method);
  const cautions = [
    ...template.cautions,
    ...(input.cautions ?? []),
  ].slice(0, 8);

  return {
    detectedPlatform: input.platform,
    confidence: input.confidence,
    evidence: input.evidence.slice(0, 8),
    recommendedMethod: method,
    steps: template.steps,
    placement: template.placement,
    verificationSteps: template.verificationSteps,
    cautions,
    requiresDeveloper: input.requiresDeveloper ?? template.requiresDeveloper,
    alternateMethods: template.alternateMethods,
    existingInstallationDetected: Boolean(input.existingInstallationDetected),
    needsClarification: Boolean(input.needsClarification),
    clarificationQuestion: input.clarificationQuestion ?? null,
  };
}

export function describePlatformFinding(
  platform: DetectedPlatform,
  confidence: WebsiteAnalysisResult["confidence"],
): string {
  if (platform === "unknown" || platform === "generic_html") {
    return "This looks like a custom site, so we recommend the universal installation.";
  }
  if (confidence === "low") {
    return `We found some signs of ${PLATFORM_LABELS[platform]}, but we are not certain.`;
  }
  return `We found signs that this site uses ${PLATFORM_LABELS[platform]}.`;
}

export function describeMethod(method: RecommendedMethod): string {
  return METHOD_LABELS[method];
}

/** Platforms customers can pick when detection is uncertain. */
export const MANUAL_PLATFORM_OPTIONS: Array<{
  value: DetectedPlatform;
  label: string;
}> = [
  { value: "nextjs", label: PLATFORM_LABELS.nextjs },
  { value: "react", label: PLATFORM_LABELS.react },
  { value: "wordpress", label: PLATFORM_LABELS.wordpress },
  { value: "shopify", label: PLATFORM_LABELS.shopify },
  { value: "webflow", label: PLATFORM_LABELS.webflow },
  { value: "squarespace", label: PLATFORM_LABELS.squarespace },
  { value: "wix", label: PLATFORM_LABELS.wix },
  { value: "framer", label: PLATFORM_LABELS.framer },
  { value: "gtm", label: PLATFORM_LABELS.gtm },
  { value: "generic_html", label: PLATFORM_LABELS.generic_html },
];
