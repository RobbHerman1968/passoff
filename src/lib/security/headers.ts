type Header = { key: string; value: string };

/**
 * Response headers for every Passoff page and route.
 *
 * The content security policy is deliberately limited to directives that cannot break
 * Next.js, Auth.js, Stripe, or Mux: it stops other sites framing Passoff (clickjacking),
 * stops `<base>` and plugin injection, and nothing else. A script-restricting policy needs
 * per-request nonces and is tracked as post-launch hardening in docs/SECURITY.md.
 */
export function appSecurityHeaders(): Header[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    {
      key: "Content-Security-Policy",
      value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
    // Browsers ignore this over plain http, so it only takes effect on https deployments.
    { key: "Strict-Transport-Security", value: "max-age=63072000" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ];
}

/** Share links, invitations, and reset links hold a secret in the address. */
export function privateLinkHeaders(): Header[] {
  return [
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "Cache-Control", value: "private, no-store" },
    { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  ];
}
