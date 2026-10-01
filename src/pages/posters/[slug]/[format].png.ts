/*
  /posters/<slug>/<format>.png (PLAN.md section 4.1). Every show page gets
  the link-preview poster; upcoming shows get every format.
*/
import type { APIRoute, GetStaticPaths } from 'astro';
import { allShows, BUILD_NOW, posterPhotos } from '../../../lib/load-shows';
import { FORMATS, type PosterFormat } from '../../../lib/posters/formats';
import { renderPoster } from '../../../lib/posters/render';
import { hasPage, isUpcoming } from '../../../lib/shows-data';
import type { Show } from '../../../lib/shows-schema';

export const getStaticPaths = (() =>
  allShows.filter(hasPage).flatMap((show) =>
    FORMATS.filter((f) => !f.upcomingOnly || isUpcoming(show, BUILD_NOW)).map((format) => ({
      params: { slug: show.slug, format: format.key },
      props: { show, format },
    })),
  )) satisfies GetStaticPaths;

export const GET: APIRoute<{ show: Show; format: PosterFormat }> = async ({ props }) => {
  const png = await renderPoster(props.show, props.format, { photos: posterPhotos });
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
