/*
  Security headers (PLAN.md section 12). GitHub Pages can't set headers, so
  Cloudflare adds these in front of it (docs/security-headers.md). This file
  is the single source: the doc must quote it exactly (a unit test checks),
  and an end-to-end test serves the site under this policy and fails on any
  violation.

  The policy allows only what the site uses: its own files, YouTube's
  privacy-enhanced player once someone presses play, Apple's song clips once
  someone presses play on a track, Formspree, and Google Analytics (ADR 0023). No inline scripts (astro.config.mjs keeps every script
  external), so no hashes that change every build. JSON-LD and the Tonight
  data island are data blocks, which CSP doesn't apply to.
*/

const YOUTUBE = 'https://www.youtube-nocookie.com';
const FORMSPREE = 'https://formspree.io';
// Google's documented CSP for Google Analytics 4: the script, then the hosts it sends hits to.
const GA_SCRIPT = 'https://www.googletagmanager.com';
const GA_COLLECT = ['https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com'];
const GA_PIXEL = ['https://*.google-analytics.com', 'https://*.googletagmanager.com'];
const APPLE_PREVIEWS = 'https://audio-ssl.itunes.apple.com'; // song clips for the record player (ADR 0016)

export const CSP_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'", GA_SCRIPT],
  'style-src': ["'self'"],
  'img-src': ["'self'", 'data:', ...GA_PIXEL], // data: for the film-grain SVG in base.css
  'font-src': ["'self'"],
  'media-src': ["'self'", APPLE_PREVIEWS],
  'connect-src': ["'self'", FORMSPREE, ...GA_COLLECT],
  'frame-src': [YOUTUBE],
  'form-action': ["'self'", FORMSPREE],
  'base-uri': ["'self'"],
  'object-src': ["'none'"],
  'frame-ancestors': ["'none'"],
};

export const CSP = Object.entries(CSP_DIRECTIVES)
  .map(([name, values]) => [name, ...values].join(' '))
  .join('; ');

const off = ['accelerometer', 'camera', 'geolocation', 'gyroscope', 'magnetometer', 'microphone', 'payment', 'usb', 'browsing-topics'];
// The player needs these; the iframe's `allow` attribute (src/scripts/video-stage.ts) asks for the same list.
const forPlayer = ['autoplay', 'clipboard-write', 'encrypted-media', 'fullscreen', 'picture-in-picture', 'web-share'];

export const PERMISSIONS_POLICY = [...off.map((f) => `${f}=()`), ...forPlayer.map((f) => `${f}=(self "${YOUTUBE}")`)].join(', ');

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CSP,
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': PERMISSIONS_POLICY,
};
