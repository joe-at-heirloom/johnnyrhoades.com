/** URL slugs for show pages: "2026-10-23-blue-goose-inn-st-clair-shores". */

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents: Németh → Nemeth
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '') // Octopus' → octopus
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Date, venue and town. The town is left off when the venue name already ends with it. */
export function showSlug(localDate: string, venueName: string, city: string): string {
  const venue = slugify(venueName);
  const town = slugify(city);
  const place = town && !venue.endsWith(town) ? `${venue}-${town}` : venue;
  return `${localDate}-${place}`;
}
