/*
  Analytics events (PLAN.md section 13) through Google Analytics (ADR 0023).
  A no-op when analytics isn't running: not configured, another host than the
  real domain, or a visitor who asked not to be tracked (src/scripts/analytics.ts).
  Links and buttons declare their events in markup instead (data-event).
*/
type Gtag = (command: 'event', name: string, params?: Record<string, string | number>) => void;

export function track(event: string, data?: Record<string, string | number>): void {
  try {
    (window as unknown as { gtag?: Gtag }).gtag?.('event', event, data);
  } catch {
    // never let analytics break the page
  }
}
