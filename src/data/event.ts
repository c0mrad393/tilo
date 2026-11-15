/* A short event on the site: its own look, a banner over every page, a subject and a wall of
   its own. Only one at a time; off outside its dates, so nothing has to be taken down by hand.

   Release week (15 to 20 November 2026): GTA VI comes out on 19 November, and Tilo draws
   along while people wait. Tilo has nothing to do with Rockstar Games or the game: no logo,
   lettering, art or characters of theirs appear anywhere, only the name and the date, and
   our own drawings in a sunset mood. The subject (No. 313) is in prompt.ts and the wall
   (No. 5) in wall.ts, each marked with this event's id. */

export interface SiteEvent {
  id: string;
  name: string;
  /** when the look and the banner are on, in ms (midnights in Tbilisi) */
  starts: number;
  ends: number;
  /** when the event's wall goes up (wall.ts WALL_EVENTS): when the wall before it closes */
  wallFrom: number;
  /** what the banner counts down to, and what it says once it's passed */
  countTo: number;
  before: string;
  after: string;
}

export const EVENT: SiteEvent = {
  id: "release",
  name: "Release week",
  starts: Date.UTC(2026, 10, 14, 20),
  ends: Date.UTC(2026, 10, 20, 20),
  wallFrom: Date.UTC(2026, 10, 16, 20),
  // midnight on 19 November in Tbilisi
  countTo: Date.UTC(2026, 10, 18, 20),
  before: "GTA VI is out in",
  after: "GTA VI is out now.",
};

export const eventOn = (t = Date.now()) => t >= EVENT.starts && t < EVENT.ends;
