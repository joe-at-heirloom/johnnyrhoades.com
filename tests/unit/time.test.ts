import { describe, expect, it } from 'vitest';
import { clockTime, localDate, localToIso, longDate, shortDate, slugTime, titleDate, venueZone } from '../../src/lib/time.ts';

const DET = 'America/Detroit';

describe('localToIso', () => {
  it('attaches the venue offset to a Bandsintown local time', () => {
    expect(localToIso('2026-10-02T18:00:00', DET)).toBe('2026-10-02T18:00:00-04:00');
    expect(localToIso('2026-12-31T21:00:00', DET)).toBe('2026-12-31T21:00:00-05:00');
  });

  // DST ends Sunday, November 1, 2026 (PLAN.md section 12).
  it('handles the end of daylight time', () => {
    expect(localToIso('2026-10-31T21:00:00', DET)).toBe('2026-10-31T21:00:00-04:00');
    expect(localToIso('2026-11-01T20:00:00', DET)).toBe('2026-11-01T20:00:00-05:00');
    // 1:30 am happens twice that night; we take the first (daylight) one.
    expect(localToIso('2026-11-01T01:30:00', DET)).toBe('2026-11-01T01:30:00-04:00');
  });

  // DST starts Sunday, March 14, 2027.
  it('handles the start of daylight time', () => {
    expect(localToIso('2027-03-13T20:00:00', DET)).toBe('2027-03-13T20:00:00-05:00');
    expect(localToIso('2027-03-14T20:00:00', DET)).toBe('2027-03-14T20:00:00-04:00');
    // 2:30 am doesn't exist that night; it moves forward an hour.
    expect(localToIso('2027-03-14T02:30:00', DET)).toBe('2027-03-14T03:30:00-04:00');
  });

  it('keeps an explicit offset if Bandsintown ever sends one', () => {
    expect(localToIso('2026-10-02T22:00:00Z', DET)).toBe('2026-10-02T22:00:00Z');
  });

  it('rejects garbage instead of guessing', () => {
    expect(() => localToIso('next friday', DET)).toThrow(/Invalid date/);
  });
});

describe('venueZone', () => {
  it('defaults to Detroit and knows the neighbors', () => {
    expect(venueZone('MI', 'US')).toBe(DET);
    expect(venueZone('', 'US')).toBe(DET);
    expect(venueZone('IL', 'US')).toBe('America/Chicago');
    expect(venueZone('ON', 'CA')).toBe('America/Toronto');
  });

  it('converts a Chicago show in Chicago time', () => {
    expect(localToIso('2026-10-02T20:00:00', venueZone('IL', 'US'))).toBe('2026-10-02T20:00:00-05:00');
  });
});

describe('formatting in the venue zone', () => {
  const iso = '2026-10-23T21:00:00-04:00';
  it('formats dates and times the way the site shows them', () => {
    expect(localDate(iso, DET)).toBe('2026-10-23');
    expect(shortDate(iso, DET)).toBe('Fri, Oct 23');
    expect(longDate(iso, DET)).toBe('Friday, October 23');
    expect(titleDate(iso, DET)).toBe('Fri Oct 23, 2026');
    expect(clockTime(iso, DET)).toBe('9 pm');
    expect(clockTime('2026-10-17T19:30:00-04:00', DET)).toBe('7:30 pm');
    expect(clockTime('2026-09-27T11:00:00-04:00', DET)).toBe('11 am');
    expect(clockTime('2026-09-27T12:00:00-04:00', DET)).toBe('12 pm');
    expect(slugTime('2026-10-17T19:30:00-04:00', DET)).toBe('730pm');
  });

  it('uses the venue date, not UTC, near midnight', () => {
    expect(localDate('2026-10-23T23:30:00-04:00', DET)).toBe('2026-10-23');
  });
});
