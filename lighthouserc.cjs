/*
  Lighthouse CI against the budgets in PLAN.md section 12: mobile, on the home
  page, a show page, the press kit and the blues maker. `npm run lhci` builds first; CI runs
  `lhci autorun` on the build it already has.

  The show page is the first one in the built sitemap, so this measures what
  would ship today. Results stay local (.lighthouseci/), never uploaded.

  The build is served over HTTP/2 with gzip (scripts/serve-dist.ts), as GitHub
  Pages and Cloudflare serve it. lhci's own static server is HTTP/1.1, and
  Lighthouse's simulation then queues requests six at a time, which read
  about 0.9 s slower on the home page's LCP than staging does (ADR 0026).
*/
const { readFileSync } = require('node:fs');

const sitemap = readFileSync('dist/sitemap-0.xml', 'utf8');
const show = sitemap.match(/<loc>https:\/\/johnnyrhoades\.com(\/shows\/[^<]+)<\/loc>/)?.[1];
if (!show) console.warn('No show page in the sitemap; measuring / and /epk/ only.');

const chromePath = process.env.CHROME_PATH || require('@playwright/test').chromium.executablePath();
const PORT = 4510;

module.exports = {
  ci: {
    collect: {
      startServerCommand: `node --experimental-strip-types --disable-warning=ExperimentalWarning scripts/serve-dist.ts ${PORT}`,
      startServerReadyPattern: 'Serving dist',
      url: ['/', show, '/epk/', '/jam/'].filter(Boolean).map((path) => `https://localhost:${PORT}${path}`),
      numberOfRuns: 3,
      chromePath,
      // The certificate is a throwaway self-signed one, made by serve-dist.ts for each run.
      settings: { chromeFlags: '--headless=new --ignore-certificate-errors' },
    },
    assert: {
      assertMatrix: [
        {
          matchingUrlPattern: '.*',
          assertions: {
            'categories:performance': ['error', { minScore: 0.95, aggregationMethod: 'median' }],
            'categories:accessibility': ['error', { minScore: 1 }],
            'categories:best-practices': ['error', { minScore: 1 }],
            'categories:seo': ['error', { minScore: 1 }],
            // A shift in any run fails: they tend to be intermittent.
            'cumulative-layout-shift': ['error', { maxNumericValue: 0.05, aggregationMethod: 'pessimistic' }],
            // The 2.0 s bar in PLAN.md is a field metric (Search Console, real phones). In the lab it's a
            // warning to watch, not a gate (ADR 0012): over HTTP/2 the home page reads about 1.8 s (ADR 0026).
            'largest-contentful-paint': ['warn', { maxNumericValue: 2000, aggregationMethod: 'median' }],
          },
        },
        {
          // Home: at most 30 KB of JavaScript before interaction, 600 KB first view (video excluded: it loads on click).
          matchingUrlPattern: '^https://localhost:\\d+/$',
          assertions: {
            'resource-summary:script:size': ['error', { maxNumericValue: 30 * 1024 }],
            'total-byte-weight': ['error', { maxNumericValue: 600 * 1024 }],
          },
        },
      ],
    },
    upload: { target: 'filesystem', outputDir: '.lighthouseci' },
  },
};
