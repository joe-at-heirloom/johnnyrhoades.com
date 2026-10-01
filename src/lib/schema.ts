/*
  Structured data (schema.org JSON-LD), PLAN.md section 9 and Appendix B.

  - siteGraph: WebSite, Person (Johnny), MusicGroup (his band), MusicAlbum. On every page.
  - musicEvent: one per public show page. Never for private shows.
  - breadcrumbs and itemList: navigation for show pages and /shows/.

  Only `live` official profiles go into sameAs. Album and store links aren't
  profiles and stay out (PLAN.md section 2).
*/
import { isoDuration, type Media, type Video } from './media.ts';
import { ARTIST, SITE_URL, absolute, showPath } from './site.ts';
import type { Show } from './shows-schema.ts';

export const IDS = {
  website: `${SITE_URL}/#website`,
  johnny: `${SITE_URL}/#johnny`,
  band: `${SITE_URL}/#band`,
  album: `${SITE_URL}/#waiting-on-the-sun`,
} as const;

type Node = Record<string, unknown>;

/** `description` must come from a verified ledger fact (structured data allows nothing weaker). */
export function siteGraph({ portraitUrl, sameAs, album, description }: { portraitUrl: string; sameAs: string[]; album: Media['album']; description: string }): Node {
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
        description,
        jobTitle: 'Blues guitarist and singer',
        url: `${SITE_URL}/`,
        image: portraitUrl,
        homeLocation: { '@type': 'Place', name: 'Detroit, Michigan' },
        sameAs,
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
        name: album.title,
        datePublished: album.released.toISOString().slice(0, 10),
        numTracks: album.tracks.length,
        byArtist: { '@id': IDS.johnny },
        url: album.appleMusic,
        track: {
          '@type': 'ItemList',
          numberOfItems: album.tracks.length,
          itemListElement: album.tracks.map((t, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            item: { '@type': 'MusicRecording', name: t.title, duration: isoDuration(t.length), url: `https://music.apple.com/us/album/${t.slug}/942326904?i=${t.appleId}` },
          })),
        },
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

/** VideoObject for a YouTube video (PLAN.md section 7.1). Facts come from the video's own page. */
export function videoObject(v: Video): Node {
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: v.title,
    description: `${v.title}. ${v.context}.`,
    thumbnailUrl: `https://i.ytimg.com/vi/${v.id}/maxresdefault.jpg`,
    uploadDate: v.uploadDate.toISOString().slice(0, 10),
    duration: isoDuration(v.duration),
    contentUrl: `https://www.youtube.com/watch?v=${v.id}`,
    embedUrl: `https://www.youtube-nocookie.com/embed/${v.id}`,
  };
}
