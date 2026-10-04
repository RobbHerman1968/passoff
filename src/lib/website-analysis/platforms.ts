export const DETECTED_PLATFORMS = [
  "nextjs",
  "react",
  "wordpress",
  "shopify",
  "webflow",
  "squarespace",
  "wix",
  "framer",
  "gtm",
  "generic_html",
  "unknown",
] as const;

export type DetectedPlatform = (typeof DETECTED_PLATFORMS)[number];

export const RECOMMENDED_METHODS = [
  "nextjs_script",
  "gtm_custom_html",
  "wordpress_header",
  "shopify_theme",
  "webflow_custom_code",
  "squarespace_code_injection",
  "wix_custom_code",
  "framer_custom_code",
  "generic_html_body",
  "manual_choice",
] as const;

export type RecommendedMethod = (typeof RECOMMENDED_METHODS)[number];

export const PLATFORM_LABELS: Record<DetectedPlatform, string> = {
  nextjs: "Next.js",
  react: "React or JavaScript app",
  wordpress: "WordPress",
  shopify: "Shopify",
  webflow: "Webflow",
  squarespace: "Squarespace",
  wix: "Wix",
  framer: "Framer",
  gtm: "Google Tag Manager",
  generic_html: "Custom HTML site",
  unknown: "Unknown or custom platform",
};

export const METHOD_LABELS: Record<RecommendedMethod, string> = {
  nextjs_script: "Add Passoff in the Next.js root layout",
  gtm_custom_html: "Add Passoff through Google Tag Manager",
  wordpress_header: "Add Passoff site-wide in WordPress",
  shopify_theme: "Add Passoff in the Shopify theme layout",
  webflow_custom_code: "Add Passoff in Webflow custom code",
  squarespace_code_injection: "Add Passoff with Squarespace code injection",
  wix_custom_code: "Add Passoff with Wix custom code",
  framer_custom_code: "Add Passoff in Framer custom code",
  generic_html_body: "Add Passoff before the closing body tag",
  manual_choice: "Choose where Passoff should be installed",
};

export function platformToDefaultMethod(
  platform: DetectedPlatform,
): RecommendedMethod {
  switch (platform) {
    case "nextjs":
      return "nextjs_script";
    case "gtm":
      return "gtm_custom_html";
    case "wordpress":
      return "wordpress_header";
    case "shopify":
      return "shopify_theme";
    case "webflow":
      return "webflow_custom_code";
    case "squarespace":
      return "squarespace_code_injection";
    case "wix":
      return "wix_custom_code";
    case "framer":
      return "framer_custom_code";
    case "react":
    case "generic_html":
    case "unknown":
    default:
      return "generic_html_body";
  }
}

export function isDetectedPlatform(value: string): value is DetectedPlatform {
  return (DETECTED_PLATFORMS as readonly string[]).includes(value);
}
