/*
  ZIP code → region tag for the mailing list (PLAN.md section 11), so show
  announcements can go to people nearby. Michigan ZIPs by their first three
  digits (USPS sectional centers), with Ann Arbor and Ypsilanti picked out of
  the 481 range they share with the Detroit suburbs.
*/
export const REGIONS = ['Metro Detroit', 'Ann Arbor', 'Lansing', 'West Michigan', 'Elsewhere in Michigan', 'Out of state'] as const;
export type Region = (typeof REGIONS)[number];

const ANN_ARBOR = new Set(['48103', '48104', '48105', '48106', '48107', '48108', '48109', '48113', '48197', '48198']);

export function regionForZip(input: string): Region | null {
  const zip = input.trim().slice(0, 5);
  if (!/^\d{5}$/.test(zip)) return null;
  if (ANN_ARBOR.has(zip)) return 'Ann Arbor';
  const prefix = Number(zip.slice(0, 3));
  if (prefix >= 480 && prefix <= 483) return 'Metro Detroit';
  if (prefix === 488 || prefix === 489) return 'Lansing';
  if (prefix >= 490 && prefix <= 495) return 'West Michigan';
  if (prefix >= 484 && prefix <= 499) return 'Elsewhere in Michigan';
  return 'Out of state';
}
