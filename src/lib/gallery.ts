/*
  The photo grid's layout. Four columns on wide screens, two on phones, and
  every block closes square, so the grid never ends ragged:

    feature (2x2, landscape) | tall (1x2, portrait) | tall
    tall | tall | feature
    small (1x1, landscape) x 4

  Blocks alternate sides while there are two portraits and a landscape to
  fill one. Whatever is left becomes small tiles, in the original order.
*/

export type Shape = 'portrait' | 'landscape';
export type Slot = 'feature' | 'tall' | 'small';

export function galleryLayout<T extends { shape?: Shape }>(photos: T[]): { photo: T; slot: Slot }[] {
  const portraits = photos.filter((p) => p.shape === 'portrait');
  const landscapes = photos.filter((p) => p.shape !== 'portrait');
  const out: { photo: T; slot: Slot }[] = [];
  let flip = false;
  while (portraits.length >= 2 && landscapes.length >= 1) {
    const feature = { photo: landscapes.shift()!, slot: 'feature' as const };
    const talls = [portraits.shift()!, portraits.shift()!].map((photo) => ({ photo, slot: 'tall' as const }));
    out.push(...(flip ? [...talls, feature] : [feature, ...talls]));
    flip = !flip;
  }
  const rest = new Set<T>([...landscapes, ...portraits]);
  for (const photo of photos) if (rest.has(photo)) out.push({ photo, slot: 'small' });
  return out;
}
