/*
  Lighthouse CI against the budgets in PLAN.md section 12: mobile, on the home
  page, a show page and the press kit. `npm run lhci` builds first; CI runs
  `lhci autorun` on the build it already has.

  The show page is the first one in the built sitemap, so this measures what
  would ship today. Results stay local (.lighthouseci/), never uploaded.
*/
const { readFileSync } = require('node:fs');

const sitemap = readFileSync('dist/sitemap-0.xml', 'utf8');
const show = sitemap.match(/<loc>https:\/\/johnnyrhoades\.com(\/shows\/[^<]+)<\/loc>/)?.[1];
if (!show) console.warn('No show page in the sitemap; measuring / and /epk/ only.');

const chromePath = process.env.CHROME_PATH || require('@playwright/test').chromium.executablePath();

module.exports = {
  ci: {
    collect: {
      staticDistDir: './dist',
      url: ['/', show, '/epk/'].filter(Boolean).map((path) => `http://localhost${path}`),
      numberOfRuns: 3,
      chromePath,
      settings: { chromeFlags: '--headless=new' },
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
            // The 2.0 s bar in PLAN.md is a field metric (Search Console, real phones). Lighthouse's
            // simulated slow 4G reads higher, so in the lab it's a warning to watch, not a gate (ADR 0012).
            'largest-contentful-paint': ['warn', { maxNumericValue: 2000, aggregationMethod: 'median' }],
          },
        },
        {
          // Home: at most 30 KB of JavaScript before interaction, 600 KB first view (video excluded: it loads on click).
          matchingUrlPattern: '^http://localhost:\\d+/$',
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
