// @ts-check
import { defineConfig } from 'astro/config';
import edgeFiles from './src/integrations/edge-files.ts';

export default defineConfig({
  site: 'https://johnnyrhoades.com',
  trailingSlash: 'always',
  // dist/_headers and dist/_redirects for Cloudflare Workers (ADR 0027).
  integrations: [edgeFiles()],
  build: {
    format: 'directory',
  },
  vite: {
    build: {
      // Never inline scripts or assets. Small scripts would otherwise be inlined,
      // and the Content Security Policy would need hashes that change every build (ADR 0012).
      assetsInlineLimit: 0,
    },
  },
  image: {
    // Photos are re-encoded to WebP at build time from the masters in src/assets/.
    responsiveStyles: false,
  },
  devToolbar: {
    enabled: false,
  },
});
