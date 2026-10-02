/*
  Song previews for the record player (ADR 0016). For now they're Apple
  Music's 30-second clips, streamed from Apple, never copied here. When
  Johnny's own files come over from Bandzoogle, clips under /audio/ replace
  them and `previewSource` becomes `own`.
*/

export const APPLE_PREVIEW_HOST = 'https://audio-ssl.itunes.apple.com/';

/** A preview is either Apple's stream or a file the site serves itself. */
export const isAllowedPreview = (url: string) => url.startsWith(APPLE_PREVIEW_HOST) || /^\/audio\/[\w-]+\.(m4a|mp3|ogg|opus)$/.test(url);

/** The album id at the end of an Apple Music album URL. */
export function appleAlbumId(url: string): string | null {
  return url.match(/\/album\/[^/]+\/(\d+)/)?.[1] ?? null;
}

/** Track id → preview URL, from an iTunes lookup response. */
export function previewsFromLookup(data: unknown): Map<string, string> {
  const out = new Map<string, string>();
  const results = (data as { results?: { wrapperType?: string; trackId?: number; previewUrl?: string }[] })?.results ?? [];
  for (const r of results) {
    if (r.wrapperType === 'track' && r.trackId && r.previewUrl?.startsWith(APPLE_PREVIEW_HOST)) out.set(String(r.trackId), r.previewUrl);
  }
  return out;
}

/**
 * Writes preview URLs into media.yaml's one-line track entries, matched by
 * appleId, keeping every comment and the rest of the file as it is.
 */
export function setPreviews(yaml: string, previews: Map<string, string>): string {
  return yaml.replace(/^(\s*- \{[^}\n]*appleId: "(\d+)"[^}\n]*?)(, preview: "[^"]*")?( \})$/gm, (line, head: string, id: string, _old, tail: string) => {
    const url = previews.get(id);
    return url ? `${head}, preview: "${url}"${tail}` : line;
  });
}
