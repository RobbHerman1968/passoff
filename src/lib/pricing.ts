/**
 * Packaging for Pass-Off Approval Rooms — first release.
 * Trial + Solo are purchasable. Studio/Agency are listed as coming later.
 */
export type BillingInterval = "monthly" | "annual";

export type PricingPlan = {
  id: "trial" | "solo" | "studio" | "agency";
  name: string;
  description: string;
  highlighted?: boolean;
  purchasable: boolean;
  comingLater?: boolean;
  price: {
    monthly: number;
    /** Effective monthly price when billed annually. */
    annualMonthly: number;
  };
  capacity: string;
  features: string[];
  cta: { label: string; href: string };
};

export const pricingPlans: PricingPlan[] = [
  {
    id: "trial",
    name: "Trial",
    description: "Validate the full approval-room workflow—no card required.",
    purchasable: true,
    price: { monthly: 0, annualMonthly: 0 },
    capacity: "Up to 2 active approval rooms · 14 days",
    features: [
      "Client review, approval, and handoff workflow",
      "No credit card required",
      "Unlimited client reviewers",
      "Immutable revision approval records",
    ],
    cta: { label: "Start free trial", href: "/login?mode=signup" },
  },
  {
    id: "solo",
    name: "Solo",
    description: "For freelancers closing client work with Pass-Off Approval Rooms.",
    highlighted: true,
    purchasable: true,
    price: { monthly: 19, annualMonthly: 15 },
    capacity: "Up to 5 active approval rooms · 10 GB",
    features: [
      "Unlimited client reviewers",
      "Approval records tied to immutable revisions",
      "Handoff delivery from the same review link",
      "Pass-Off vendor attribution",
    ],
    cta: { label: "Choose Solo", href: "/login?mode=signup" },
  },
  {
    id: "studio",
    name: "Studio",
    description: "Team seats and fuller branding — coming later.",
    purchasable: false,
    comingLater: true,
    price: { monthly: 49, annualMonthly: 39 },
    capacity: "Coming later",
    features: [
      "Team collaboration (coming later)",
      "Extended room capacity (coming later)",
      "Fuller branding options (coming later)",
    ],
    cta: { label: "Coming later", href: "/pricing" },
  },
  {
    id: "agency",
    name: "Agency",
    description: "Custom domains and white-label options — coming later.",
    purchasable: false,
    comingLater: true,
    price: { monthly: 99, annualMonthly: 79 },
    capacity: "Coming later",
    features: [
      "Custom domains (coming later)",
      "White-label client experience (coming later)",
      "Larger team capacity (coming later)",
    ],
    cta: { label: "Coming later", href: "/pricing" },
  },
] as const;

/** Plans shown with purchase actions on the public pricing page. */
export const publicPricingPlans = pricingPlans.filter(
  (p) => p.id === "trial" || p.id === "solo" || p.comingLater,
);

export const pricingNotes = [
  "Clients and reviewers are always free—only the workspace is billed.",
  "Archived approval rooms stay readable and do not count against active-room limits.",
  "After trial expiration, existing rooms remain readable; creating or editing requires Solo.",
] as const;

export function formatPlanPrice(plan: PricingPlan, interval: BillingInterval) {
  if (plan.id === "trial") {
    return { amount: "$0", period: "for 14 days" };
  }
  if (plan.comingLater) {
    return { amount: "—", period: "coming later" };
  }

  const value = interval === "annual" ? plan.price.annualMonthly : plan.price.monthly;
  return {
    amount: `$${value}`,
    period: interval === "annual" ? "per month, billed annually" : "per month",
  };
}
