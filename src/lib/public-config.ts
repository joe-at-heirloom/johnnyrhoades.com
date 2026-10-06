/*
  Public service IDs. They're public by design: each only lets the site send
  to Johnny or count its own visits. Secrets never go here (CLAUDE.md,
  non-negotiable 9). The live values are the defaults (ADR 0023); a PUBLIC_*
  build variable overrides one (.env.example), which is how the end-to-end
  build points the forms at fakes.
*/
export const PUBLIC_CONFIG = {
  /** Formspree form IDs (https://formspree.io/f/<id>). */
  formspreeBooking: import.meta.env.PUBLIC_FORMSPREE_BOOKING || 'mqpeaklz',
  formspreeSignup: import.meta.env.PUBLIC_FORMSPREE_SIGNUP || 'mzedzbvd',
  /** Google Analytics 4 measurement ID. */
  gaId: import.meta.env.PUBLIC_GA_ID || 'G-ZD74NE0HZS',
  /** Analytics only run on these hosts, so staging, previews and tests don't skew the numbers. */
  gaHosts: import.meta.env.PUBLIC_GA_HOSTS || 'johnnyrhoades.com,www.johnnyrhoades.com',
};
