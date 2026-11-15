import { call } from "./account";

/* The facts the terms, the privacy policy and the takedown page are written around, in one
   place, so the pages and the server can't drift apart. */

/** Who runs Tilo. Fill in the name before accounts open: the privacy policy must say who
    is responsible for the data. Empty, the pages say "the person who runs Tilo". */
export const OPERATOR = {
  name: "Otari Kharebashvili",
  /** a private person, not a company */
  kind: "a private person",
  country: "Georgia",
};
export const runBy = OPERATOR.name ? `${OPERATOR.name}, ${OPERATOR.kind} in ${OPERATOR.country}` : `${OPERATOR.kind} in ${OPERATOR.country}`;

/** the service that sends sign-in emails, named in the privacy policy */
export const MAIL_SERVICE = "Resend, Inc. (USA)";

export const CONTACT = "hello@tiloart.com";
export const LEGAL = "legal@tiloart.com";
export const MIN_AGE = 16;
/** how soon a takedown claim is answered */
export const ANSWER_IN = "two working days";

/** The version of the terms, which is also their date. It must match tilo_meta.settings
    terms_version on the server (migration 0008); claim_handle refuses any other. Change
    both, in a new migration, when the terms change in a way members must agree to again. */
export const TERMS_VERSION = "2026-11-04";
export const UPDATED = "15 November 2026";

export type ClaimKind = "copyright" | "abuse" | "privacy" | "other";
export interface Claim {
  kind: ClaimKind;
  url: string;
  name: string;
  email: string;
  details: string;
  sworn: boolean;
}

export const sendClaim = (claim: Claim) => call<{ id: number }>("/api/claims", { method: "POST", json: claim });

/** Where donations go. Empty until the route is settled (2.7: PayPal receiving in Georgia
    is to be confirmed, then Ko-fi or a PayPal.me link); /support says "opens soon" until
    then, and the privacy policy names `via` once it is set. */
export const SUPPORT = {
  url: "",
  /** the service that takes the money, e.g. "Ko-fi and PayPal" */
  via: "",
};

/** what Tilo costs to run, shown on /support; the beta-size estimate in docs/STAGE2.md */
export const COSTS: [string, string][] = [
  ["The server, at netcup in Germany", "about €8 a month"],
  ["Backups at a second provider", "€0–3 a month"],
  ["The tiloart.com domain", "about $10 a year"],
  ["Cloudflare and sign-in mail", "free tiers, for now"],
];
