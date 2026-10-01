// The small part of opentype.js 2 the poster engine uses (the package ships no types).
declare module 'opentype.js' {
  export interface Font {
    unitsPerEm: number;
    ascender: number;
    descender: number;
    getAdvanceWidth(text: string, fontSize: number, options?: { kerning?: boolean }): number;
  }
  export function parse(buffer: ArrayBuffer): Font;
}
