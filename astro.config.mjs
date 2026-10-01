// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://johnnyrhoades.com',
  trailingSlash: 'always',
  build: {
    format: 'directory',
  },
  image: {
    // Photos are re-encoded to WebP at build time from the masters in src/assets/.
    responsiveStyles: false,
  },
  devToolbar: {
    enabled: false,
  },
});
