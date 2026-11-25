/*
  Styles for the blues maker (/jam/, ADR 0030): a band and a mix in one
  click. Each is a whole song (key, feel, tempo, form, tones) and a mix, so
  picking one is the same as following a link to it. They're kinds of blues,
  not claims about anyone.
*/
import { DEFAULT_SONG, type Song } from './jam';
import { DEFAULT_MIX, cloneMix, type Mix } from './mixer';

export type Style = { id: string; label: string; blurb: string; song: Song; mix: Mix };

function mixWith(change: (m: Mix) => void): Mix {
  const m = cloneMix(DEFAULT_MIX);
  change(m);
  return m;
}

const song = (s: Partial<Song> & Pick<Song, 'key' | 'feel' | 'bpm' | 'parts'>): Song => ({ ...DEFAULT_SONG, ...s });

export const STYLES: readonly Style[] = [
  {
    id: 'chicago',
    label: 'Chicago shuffle',
    blurb: 'Electric bass, a crunchy guitar and a harp through a bullet mic, with the quick change.',
    song: song({ key: 'E', feel: 'shuffle', bpm: 104, quick: true, parts: { drums: 'sticks', bass: 'electric', guitar: 'crunch', keys: 'piano', lead: 'harp', room: 'bar' } }),
    mix: mixWith((m) => {
      m.strips.lead = { ...m.strips.lead, db: -3.5, send: 0.3 };
      m.strips.guitar = { ...m.strips.guitar, db: -5, pan: -0.35 };
      m.master.drive = 0.3;
    }),
  },
  {
    id: 'texas',
    label: 'Texas slow blues',
    blurb: 'A slow twelve-eight in G, clean guitar, organ underneath, and a big room.',
    song: song({ key: 'G', feel: 'slow', bpm: 60, quick: true, parts: { drums: 'sticks', bass: 'electric', guitar: 'clean', keys: 'organ', lead: 'sax', room: null } }),
    mix: mixWith((m) => {
      m.strips.guitar = { ...m.strips.guitar, db: -4.5, tone: 0.2, send: 0.25 };
      m.strips.keys = { ...m.strips.keys, db: -12 };
      m.master.room = 0.6;
    }),
  },
  {
    id: 'delta',
    label: 'Delta porch',
    blurb: 'Acoustic guitar, upright bass, brushes and a harp, on an old record.',
    song: song({ key: 'E', feel: 'shuffle', bpm: 84, parts: { drums: 'brushes', bass: 'upright', guitar: 'acoustic', keys: null, lead: 'harp', room: 'vinyl' } }),
    mix: mixWith((m) => {
      m.strips.drums = { ...m.strips.drums, db: -7 };
      m.strips.guitar = { ...m.strips.guitar, db: -3, pan: -0.15 };
      m.master.room = 0.15;
      m.master.drive = 0.05;
    }),
  },
  {
    id: 'jump',
    label: 'Jump boogie',
    blurb: 'A fast boogie in C with piano and a tenor sax out front.',
    song: song({ key: 'C', feel: 'boogie', bpm: 150, parts: { drums: 'sticks', bass: 'upright', guitar: 'clean', keys: 'piano', lead: 'sax', room: 'bar' } }),
    mix: mixWith((m) => {
      m.strips.lead = { ...m.strips.lead, db: -3.5 };
      m.strips.keys = { ...m.strips.keys, db: -8, pan: 0.35 };
    }),
  },
  {
    id: 'late',
    label: 'Late-night slow burn',
    blurb: 'B flat, slow, brushes and organ, a breathy sax, and the record crackling.',
    song: song({ key: 'Bb', feel: 'slow', bpm: 52, parts: { drums: 'brushes', bass: 'upright', guitar: 'clean', keys: 'organ', lead: 'sax', room: 'vinyl' } }),
    mix: mixWith((m) => {
      m.strips.drums = { ...m.strips.drums, db: -6 };
      m.strips.lead = { ...m.strips.lead, send: 0.4 };
      m.master.room = 0.75;
      m.master.drive = 0;
    }),
  },
  {
    id: 'motor-city',
    label: 'Motor City',
    blurb: 'A straight-eight in A with electric bass, organ and harp, driven hard.',
    song: song({ key: 'A', feel: 'straight', bpm: 116, parts: { drums: 'sticks', bass: 'electric', guitar: 'crunch', keys: 'organ', lead: 'harp', room: null } }),
    mix: mixWith((m) => {
      m.strips.guitar = { ...m.strips.guitar, db: -4.5 };
      m.master.drive = 0.45;
    }),
  },
];
