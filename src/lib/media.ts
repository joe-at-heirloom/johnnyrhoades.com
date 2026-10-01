/* Album, videos, photos (media.yaml) and official profiles (profiles.yaml), validated. */
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

const TrackSchema = z.strictObject({
  title: z.string().min(1),
  length: z.string().regex(/^\d+:\d{2}$/),
  appleId: z.string().regex(/^\d+$/),
  slug: z.string().regex(/^[a-z0-9-]+$/),
});

const VideoSchema = z.strictObject({
  id: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
  title: z.string().min(1),
  label: z.string().min(1),
  context: z.string().min(1),
  uploadDate: z.coerce.date(),
  duration: z.number().int().positive(),
  channel: z.string().min(1),
  epk: z.boolean().optional(),
});

const PhotoSchema = z.strictObject({
  file: z.string().min(1),
  alt: z.string().min(1),
  credit: z.string().optional(),
  license: z.string().optional(),
  use: z.array(z.enum(['gallery', 'epk', 'press'])).min(1),
  shape: z.enum(['portrait', 'landscape']).optional(),
  gridWidth: z.number().int().positive().optional(),
});

export const MediaSchema = z
  .strictObject({
    album: z.strictObject({
      title: z.string(),
      released: z.coerce.date(),
      cover: z.string(),
      coverAlt: z.string(),
      appleMusic: z.url(),
      amazon: z.url(),
      tracks: z.array(TrackSchema).min(1),
    }),
    videos: z.array(VideoSchema).min(1),
    photos: z.array(PhotoSchema).min(1),
  })
  .superRefine((m, ctx) => {
    for (const p of m.photos) {
      if (p.use.includes('gallery') && !p.shape) {
        ctx.addIssue({ code: 'custom', message: `${p.file}: gallery photos need a shape (portrait or landscape)` });
      }
      if (p.use.includes('press') && (!p.credit || !p.license || /from the watermark/i.test(p.credit))) {
        ctx.addIssue({ code: 'custom', message: `${p.file}: press downloads need a confirmed credit and license` });
      }
    }
  });

export type Media = z.infer<typeof MediaSchema>;
export type Video = Media['videos'][number];
export type Photo = Media['photos'][number];

export const parseMedia = (yamlText: string): Media => MediaSchema.parse(parseYaml(yamlText));

const ProfileSchema = z
  .strictObject({
    name: z.string().min(1),
    url: z.url().optional(),
    kind: z.enum(['profile', 'store']),
    status: z.enum(['live', 'to_claim', 'to_create']),
    note: z.string().optional(),
  })
  .refine((p) => p.status !== 'live' || p.url, { message: 'Live profiles need a URL' });

export type Profile = z.infer<typeof ProfileSchema> & { url?: string };

export const parseProfiles = (yamlText: string): Profile[] => z.array(ProfileSchema).parse(parseYaml(yamlText));

/** Live profiles and stores, for links. */
export const liveLinks = (profiles: Profile[]) => profiles.filter((p): p is Profile & { url: string } => p.status === 'live' && !!p.url);

/** Only live official profiles go into structured data sameAs (never stores). */
export const sameAs = (profiles: Profile[]) => liveLinks(profiles).filter((p) => p.kind === 'profile').map((p) => p.url);

/** "3:33" → "PT3M33S"; 255 → "PT4M15S" */
export function isoDuration(value: string | number): string {
  const seconds = typeof value === 'number' ? value : value.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `PT${m ? `${m}M` : ''}${s || !m ? `${s}S` : ''}`;
}
