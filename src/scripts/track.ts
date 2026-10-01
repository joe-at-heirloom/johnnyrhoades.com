/*
  Analytics events (PLAN.md section 13) through Umami, cookieless. A no-op
  when Umami isn't loaded: not configured, blocked, or a visitor's Do Not Track.
  Click events on links use data-umami-event attributes in the markup instead.
*/
type Umami = { track: (event: string, data?: Record<string, string | number>) => void };

export function track(event: string, data?: Record<string, string | number>): void {
  try {
    (window as unknown as { umami?: Umami }).umami?.track(event, data);
  } catch {
    // never let analytics break the page
  }
}
