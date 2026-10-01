/* Poster formats (PLAN.md section 4.1). */

export type PosterFormat = {
  key: 'og' | '1x1' | '4x3' | '16x9' | 'feed' | 'story';
  width: number;
  height: number;
  label: string;
  /** Upcoming shows get every format; past show pages keep just the link preview. */
  upcomingOnly: boolean;
};

export const FORMATS: PosterFormat[] = [
  { key: 'og', width: 1200, height: 630, label: 'Link preview', upcomingOnly: false },
  { key: '1x1', width: 1200, height: 1200, label: 'Square', upcomingOnly: true },
  { key: '4x3', width: 1200, height: 900, label: '4:3', upcomingOnly: true },
  { key: '16x9', width: 1200, height: 675, label: '16:9', upcomingOnly: true },
  { key: 'feed', width: 1080, height: 1350, label: 'Instagram post', upcomingOnly: true },
  { key: 'story', width: 1080, height: 1920, label: 'Instagram story', upcomingOnly: true },
];

export const formatByKey = (key: string) => FORMATS.find((f) => f.key === key);

export const posterPath = (slug: string, key: PosterFormat['key']) => `/posters/${slug}/${key}.png`;

/** The three ratios Google asks for in MusicEvent.image. */
export const EVENT_IMAGE_FORMATS = ['1x1', '4x3', '16x9'] as const;
