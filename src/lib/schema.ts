/*
  Structured data (schema.org JSON-LD), PLAN.md section 9 and Appendix B.

  - siteGraph: WebSite, Person (Johnny), MusicGroup (his band), MusicAlbum. On every page.
  - musicEvent: one per public show page. Never for private shows.
  - breadcrumbs and itemList: navigation for show pages and /shows/.

  Only `live` official profiles go into sameAs. Album and store links aren't
  profiles and stay out (PLAN.md section 2).
*/
import { ARTIST, SITE_URL, absolute, showPath } from './site.ts';
import type { Show } from './shows-schema.ts';

export const IDS = {
  website: `${SITE_URL}/#website`,
  johnny: `${SITE_URL}/#johnny`,
  band: `${SITE_URL}/#band`,
  album: `${SITE_URL}/#waiting-on-the-sun`,
} as const;

/** Official profiles that exist today. Phase 4 moves these into profiles.yaml. */
export const LIVE_PROFILES = [
  'https://www.bandsintown.com/a/11869348',
  'https://www.youtube.com/@johnnyrhoades86',
  'https://www.facebook.com/profile.php?id=100085365311010',
];

type Node = Record<string, unknown>;

export function siteGraph({ portraitUrl }: { portraitUrl: string }): Node {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': IDS.website,
        url: `${SITE_URL}/`,
        name: ARTIST,
        publisher: { '@id': IDS.johnny },
      },
      {
        '@type': 'Person',
        '@id': IDS.johnny,
        name: ARTIST,
        alternateName: ['John Rhoades'],
        description: 'Blues guitarist and singer from Detroit, Michigan.',
        jobTitle: 'Blues guitarist and singer',
        url: `${SITE_URL}/`,
        image: portraitUrl,
        homeLocation: { '@type': 'Place', name: 'Detroit, Michigan' },
        sameAs: LIVE_PROFILES,
      },
      {
        '@type': 'MusicGroup',
        '@id': IDS.band,
        name: `${ARTIST} Band`,
        genre: 'Blues',
        url: `${SITE_URL}/`,
        member: { '@id': IDS.johnny },
      },
      {
        '@type': 'MusicAlbum',
        '@id': IDS.album,
        name: 'Waiting on the Sun',
        datePublished: '2014-11-02',
        numTracks: 10,
        byArtist: { '@id': IDS.johnny },
        url: 'https://music.apple.com/us/album/waiting-on-the-sun/942326904',
      },
    ],
  };
}

const EVENT_STATUS: Record<Show['status'], string> = {
  scheduled: 'https://schema.org/EventScheduled',
  cancelled: 'https://schema.org/EventCancelled',
  postponed: 'https://schema.org/EventPostponed',
  rescheduled: 'https://schema.org/EventRescheduled',
};

const johnny = () => ({ '@type': 'Person', '@id': IDS.johnny, name: ARTIST, url: `${SITE_URL}/` });

function performer(s: Show): Node | Node[] {
  switch (s.act) {
    case 'trio':
    case 'band':
      return { '@type': 'MusicGroup', name: s.billing, member: johnny() };
    case 'guest': {
      const leader = s.billing.split(', with ')[0];
      return leader && leader !== ARTIST ? [{ '@type': 'MusicGroup', name: leader }, johnny()] : johnny();
    }
    default:
      return johnny();
  }
}

/** MusicEvent for a show page. `images` are absolute URLs (posters from Phase 3). */
export function musicEvent(s: Show, { images }: { images: string[] }): Node {
  if (!s.public) throw new Error(`Show ${s.id} is private; it gets no event markup.`);
  const url = absolute(showPath(s.slug));
  const v = s.venue;
  const address: Node = {
    '@type': 'PostalAddress',
    ...(v.street && { streetAddress: v.street }),
    addressLocality: v.city,
    ...(v.region && { addressRegion: v.region }),
    ...(v.postalCode && { postalCode: v.postalCode }),
    addressCountry: v.country,
  };

  let offers: Node | undefined;
  if (s.tickets?.url) {
    offers = {
      '@type': 'Offer',
      url: s.tickets.url,
      availability: 'https://schema.org/InStock',
      ...(s.tickets.price !== undefined && { price: String(s.tickets.price), priceCurrency: 'USD' }),
    };
  } else if (s.tickets?.free) {
    offers = { '@type': 'Offer', url, price: '0', priceCurrency: 'USD', availability: 'https://schema.org/InStock' };
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'MusicEvent',
    name: `${s.billing} at ${v.name}`,
    url,
    startDate: s.start,
    ...(s.end && { endDate: s.end }),
    eventStatus: EVENT_STATUS[s.status],
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    location: {
      '@type': 'Place',
      name: v.name,
      address,
      ...(v.lat !== undefined && v.lng !== undefined && { geo: { '@type': 'GeoCoordinates', latitude: v.lat, longitude: v.lng } }),
    },
    performer: performer(s),
    organizer: { '@type': 'Organization', name: v.name, ...(v.url && { url: v.url }) },
    image: images,
    description: `${s.billing} plays blues at ${v.name} in ${v.city}.`,
    ...(offers && { offers }),
  };
}

export function breadcrumbs(items: { name: string; url: string }[]): Node {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, name: item.name, item: item.url })),
  };
}

export function itemList(urls: string[]): Node {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: urls.map((url, i) => ({ '@type': 'ListItem', position: i + 1, url })),
  };
}
