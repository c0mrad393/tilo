import { call } from "./account";

/* The facts the terms, the privacy policy and the takedown page are written around, in one
   place, so the pages and the server can't drift apart. */

/** Who runs Tilo. Fill in the name before accounts open: the privacy policy must say who
    is responsible for the data. Empty, the pages say "the person who runs Tilo". */
export const OPERATOR = {
  name: "",
  /** a private person, not a company */
  kind: "a private person",
  country: "Georgia",
};
export const runBy = OPERATOR.name ? `${OPERATOR.name}, ${OPERATOR.kind} in ${OPERATOR.country}` : `${OPERATOR.kind} in ${OPERATOR.country}`;

/** the service that sends sign-in emails, named in the privacy policy once it is picked
    (2.8: Resend or Brevo) */
export const MAIL_SERVICE = "";

export const CONTACT = "hello@tiloart.com";
export const LEGAL = "legal@tiloart.com";
export const MIN_AGE = 16;
/** how soon a takedown claim is answered */
export const ANSWER_IN = "two working days";

/** The version of the terms, which is also their date. It must match tilo_meta.settings
    terms_version on the server (migration 0008); claim_handle refuses any other. Change
    both, in a new migration, when the terms change in a way members must agree to again. */
export const TERMS_VERSION = "2026-11-04";
export const UPDATED = "4 November 2026";

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
