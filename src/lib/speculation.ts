/*
  Speculation Rules (ADR 0029): when someone hovers over a link to another page
  on the site, or starts to tap it, Chrome and Edge fetch that page's HTML, so
  the click lands at once.

  Prefetch only: nothing runs until the visitor actually goes there, so
  analytics and the guitar are untouched. Downloads (calendars, posters, the
  press zip) and anything marked download or nofollow are left alone.

  The rules are inline in every page's <head> (src/layouts/BaseLayout.astro).
  The build hashes them into the CSP's script-src (src/lib/edge.ts), which costs
  no extra request. A rules file named in a header measured 0.9 s slower in the lab.
*/
export const SPECULATION_RULES = {
  prefetch: [
    {
      source: 'document',
      where: {
        and: [
          { href_matches: '/*' },
          { not: { href_matches: ['/*.ics', '/*.zip', '/*.png', '/*.jpg', '/*.webp', '/*.pdf', '/*.xml', '/*.json', '/*.txt'] } },
          { not: { selector_matches: '[download], [rel~="nofollow"]' } },
        ],
      },
      eagerness: 'moderate',
    },
  ],
};
