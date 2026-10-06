/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_FORMSPREE_BOOKING?: string;
  readonly PUBLIC_FORMSPREE_SIGNUP?: string;
  readonly PUBLIC_GA_ID?: string;
  readonly PUBLIC_GA_HOSTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
