/*
  Public service IDs, from PUBLIC_* build variables (see .env.example; in CI,
  GitHub repository variables). They're public by design: each only lets the
  site send to Johnny. Secrets never go here (CLAUDE.md, non-negotiable 9).
*/
export const PUBLIC_CONFIG = {
  web3formsKey: import.meta.env.PUBLIC_WEB3FORMS_KEY || undefined,
  buttondownUser: import.meta.env.PUBLIC_BUTTONDOWN_USER || undefined,
  umamiWebsiteId: import.meta.env.PUBLIC_UMAMI_WEBSITE_ID || undefined,
  umamiSrc: import.meta.env.PUBLIC_UMAMI_SRC || 'https://cloud.umami.is/script.js',
  /** Analytics only count visits on these hosts, so previews and tests don't skew the numbers. */
  umamiDomains: import.meta.env.PUBLIC_UMAMI_DOMAINS || 'johnnyrhoades.com',
};
