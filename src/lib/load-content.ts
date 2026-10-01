/* Facts, media and profiles, validated once at build time, plus image lookup by path. */
import type { ImageMetadata } from 'astro';
import factsYaml from '../data/facts.yaml?raw';
import mediaYaml from '../data/media.yaml?raw';
import profilesYaml from '../data/profiles.yaml?raw';
import { ledger, parseFacts } from './facts.ts';
import { parseMedia, parseProfiles } from './media.ts';

export const facts = ledger(parseFacts(factsYaml));
export const media = parseMedia(mediaYaml);
export const profiles = parseProfiles(profilesYaml);

// Every processable image under src/assets, keyed the way media.yaml refers to them ("photos/hero.jpg").
const modules = import.meta.glob<{ default: ImageMetadata }>('../assets/{photos,video}/**/*.jpg', { eager: true });
const images = new Map(Object.entries(modules).map(([path, mod]) => [path.replace('../assets/', ''), mod.default]));

export function image(file: string): ImageMetadata {
  const img = images.get(file);
  if (!img) throw new Error(`No image at src/assets/${file} (referenced from media.yaml)`);
  return img;
}

export const videoThumb = (id: string) => image(`video/${id}.jpg`);
