import type { Stroke } from "../engine/stroke";

/* The shared wall's rules, kept free of imports so tilo-api reads this very file (Node runs
   it as it is) and checks every mark the way the app does. One wall is up at a time, with a
   subject; every WALL_DAYS days, at midnight in Tbilisi, it closes, goes into the archive
   (/wall/past) and the next subject goes up on a fresh sheet. Only signed-in members draw. */

export const WALL = { w: 2000, h: 1000 } as const;
/** the inks members draw with on the wall, and the sizes */
export const WALL_COLORS = ["#1B1E1D", "#2B37D4", "#C9392F", "#F2C14E", "#3E7C6B", "#A1386B"];
export const WALL_SIZES = [3, 6, 14];
export const WALL_TOOLS = ["pencil", "ink", "marker"] as const;
/** how many days a wall stays up */
export const WALL_DAYS = 3;
export const PAPER = "#FBFAF5";
/** marks one member may put on one wall in ten minutes, and in all */
export const WALL_BURST = 150;
export const WALL_PER_MEMBER = 1500;
/** points in one mark */
export const WALL_POINTS = 1800;

export interface WallSubject {
  id: string;
  title: string;
  /** what the outline asks people to add */
  prompt: string;
}

/** the subjects, one per wall, in order: wall No. 1 had the first. They are written ahead so
    nothing has to be put up by hand; the admin panel warns when few are left, and past the
    last one they start again from the first. Add new ones at the end, never in the middle:
    an outline's strokes come from its place in this list (wall-art.ts). */
export const WALL_THEMES: WallSubject[] = [
  { id: "street", title: "The street of windows", prompt: "Every window on this street is empty. Draw who lives behind one." },
  { id: "tree", title: "The tree of everyone", prompt: "The branches are bare. Add a leaf, a bird, a fruit, someone on the swing." },
  { id: "aquarium", title: "The aquarium", prompt: "One fish, and all that water. Fill the tank." },
  { id: "market", title: "The night market", prompt: "The stalls are up and the tables are bare. What's for sale?" },
  { id: "train", title: "The long train", prompt: "Every seat is free. Put a passenger in a window." },
  { id: "sky", title: "The sky over the city", prompt: "The sky is empty. Kites, birds, balloons, weather, a dragon: fill it." },
  { id: "shelf", title: "The bookshelf", prompt: "Half the shelves are empty. Add a book, a plant, a cat asleep on top." },
  { id: "supra", title: "The long table", prompt: "A Georgian supra, and every plate is empty. What's on the table, and who's at it?" },
  { id: "beach", title: "The beach", prompt: "The towels are out and the sea is warm. Who came to the beach?" },
  { id: "flowerbed", title: "The flower bed", prompt: "Every stem is waiting for its flower. Grow one." },
  { id: "frames", title: "The gallery wall", prompt: "Every frame on this wall is empty. Hang your picture." },
  { id: "harbour", title: "The harbour", prompt: "The boats are tied up and nobody's aboard. Who sails, and with what?" },
  { id: "cafe", title: "The café terrace", prompt: "The tables are out and the chairs are free. Who's having coffee?" },
  { id: "stage", title: "The stage", prompt: "The curtain is up and the stage is bare. What's the show?" },
  { id: "jars", title: "The pantry", prompt: "A shelf of empty jars. Fill one, and write its label." },
  { id: "moon", title: "The Moon", prompt: "Nobody lives on the Moon yet. Build a base, plant a flag, bring a friend." },
  { id: "burrows", title: "Under the field", prompt: "Under the grass, every room is empty. Who lives down there?" },
  { id: "house", title: "The house with no walls", prompt: "You can see into every room, and every room is bare. Move someone in." },
  { id: "zoo", title: "The zoo of made-up animals", prompt: "Every pen has a sign and nobody in it. Invent an animal." },
  { id: "circus", title: "The big top", prompt: "The ring is lit and the act hasn't started. Who's on?" },
  { id: "washing", title: "The washing line", prompt: "The pegs are on the line. Hang something out to dry." },
  { id: "bakery", title: "The bakery window", prompt: "The trays are out and the shelves are bare. Bake something." },
  { id: "planets", title: "The solar system", prompt: "The orbits are drawn and the planets are missing. Invent a world." },
  { id: "screens", title: "The wall of screens", prompt: "Every screen is switched on and blank. What's on?" },
  { id: "snow", title: "The snowy hill", prompt: "Fresh snow and nobody on it yet. Sledges, snowmen, footprints." },
  { id: "pond", title: "The pond", prompt: "Lily pads, reeds, still water. Who's in the pond?" },
  { id: "jungle", title: "The jungle", prompt: "Leaves everywhere, and something's hiding. Draw what's in there." },
  { id: "towers", title: "The Svan towers", prompt: "Old stone towers in the mountains, their windows dark. Who keeps watch?" },
  { id: "island", title: "The treasure map", prompt: "An island with no names on it. Mark the treasure, the dangers and the way." },
  { id: "carousel", title: "The carousel", prompt: "The poles are turning with nothing on them. What do you ride?" },
  { id: "stadium", title: "The stadium", prompt: "The stands are full of empty seats. Fill them, then the pitch." },
  { id: "lighthouse", title: "The lighthouse", prompt: "The light is on and the sea is empty. Ships, whales, a storm." },
  { id: "desert", title: "The desert", prompt: "Dunes, a few cacti, and a long way to go. Who's crossing?" },
  { id: "factory", title: "The factory", prompt: "The belt is running and nothing's on it. What does this factory make?" },
  { id: "museum", title: "The museum", prompt: "Every plinth is empty. Put something on one worth looking at." },
  { id: "postcards", title: "The postcard rack", prompt: "The postcards are blank. Draw one from a place you love." },
  { id: "quilt", title: "The quilt", prompt: "A patchwork with empty squares. Fill one square." },
  { id: "busstop", title: "The bus stop", prompt: "The bench is free and the bus is late. Who's waiting?" },
  { id: "park", title: "The park", prompt: "Benches, paths, a fountain, and nobody about yet. Fill the park." },
  { id: "bridge", title: "The bridge", prompt: "An old stone bridge over the river. Who's crossing, and what's below?" },
  { id: "vineyard", title: "The vineyard", prompt: "The vines are tied and bare. Grapes, pickers, a basket, a bird." },
  { id: "cablecar", title: "The cable car", prompt: "The cabins cross the valley, every one empty. Who's riding?" },
  { id: "orchestra", title: "The orchestra", prompt: "Every chair has a stand, and nobody's playing. Who's in the band?" },
  { id: "valley", title: "The valley of giants", prompt: "A volcano, ferns, a lake. Something big lives here. Draw it." },
  { id: "camp", title: "The campfire", prompt: "The fire is lit and the tents are pitched. Who's sitting round it?" },
  { id: "maze", title: "The maze", prompt: "A maze with a way through. Draw who's lost in it, and what's at the middle." },
  { id: "classphoto", title: "The class photo", prompt: "Rows of faces, every one blank. Draw one, maybe yours." },
  { id: "road", title: "The long road", prompt: "A road across the country, and no traffic. Cars, signs, a hitchhiker." },
  { id: "cake", title: "The cake", prompt: "Five tiers and no decoration. Decorate the cake." },
  { id: "greenhouse", title: "The greenhouse", prompt: "Pots of soil on every shelf. Grow something." },
];
/** walls set aside for an event (src/data/event.ts): the subject that goes up as that wall
    instead of the next in the list, which waits for the wall after. Never the live wall's
    number or one before it: those are up or in the archive already. With `starts`, the wall
    before it closes early at that time; with `ends`, it closes then instead of after
    WALL_DAYS (the server's wall.ts). */
export const WALL_EVENTS: Record<number, WallSubject & { event: string; starts?: number; ends?: number }> = {
  5: {
    id: "strip",
    // up at once (the wall before it, empty, closes early) and for five days, to the end of
    // 20 November in Tbilisi
    starts: Date.UTC(2026, 10, 15, 12),
    ends: Date.UTC(2026, 10, 20, 20),
    title: "The sunset strip",
    prompt: "Release week. The strip is lit, the billboards are blank and the road is empty. Cars, neon, people, palms: fill it with your own.",
    event: "release",
  },
};
const eventsBefore = (no: number) => Object.keys(WALL_EVENTS).filter((n) => Number(n) < no).length;
export const themeFor = (no: number): WallSubject => WALL_EVENTS[no] ?? WALL_THEMES[(Math.max(1, no) - 1 - eventsBefore(no)) % WALL_THEMES.length];
/** how many of the list's walls are still to come after wall `no` (below zero: they have
    started over); events aren't counted */
export const wallsLeft = (no: number) => WALL_THEMES.length - (Math.max(1, no) - eventsBefore(no + 1));
/** events still to come after wall `no` */
export const eventsAfter = (no: number) => Object.keys(WALL_EVENTS).filter((n) => Number(n) > no).length;
export const themeById = (id: string): WallSubject => WALL_THEMES.find((t) => t.id === id) ?? Object.values(WALL_EVENTS).find((t) => t.id === id) ?? WALL_THEMES[0];

/** A mark as the wall keeps it: only the fields the wall's tools use. */
export type WallStroke = Pick<Stroke, "tool" | "c" | "w" | "p" | "r">;

/** Whether a stroke is one a member may put on the wall: the wall's tools, inks and sizes,
    on the sheet, and not absurdly long. Gives the reason, or null when it's fine. */
export function wallStrokeProblem(s: unknown): string | null {
  if (!s || typeof s !== "object") return "Not a stroke.";
  const { tool, c, w, p, r } = s as Stroke;
  if (!WALL_TOOLS.includes(tool as never)) return "The wall takes pencil, ink and marker.";
  if (!WALL_COLORS.includes(c)) return "Use one of the wall's inks.";
  if (!WALL_SIZES.includes(w)) return "Use one of the wall's sizes.";
  if (r !== undefined && !(Number.isInteger(r) && r >= 0 && r < 2 ** 32)) return "Not a stroke.";
  if (!Array.isArray(p) || p.length < 3 || p.length % 3 || p.length > WALL_POINTS * 3) return "A mark is 1 to 1,800 points.";
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i], y = p[i + 1], pr = p[i + 2];
    if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(pr)) return "A mark has to be on the wall.";
    if (x < -50 || x > WALL.w + 50 || y < -50 || y > WALL.h + 50 || pr < 0 || pr > 99) return "A mark has to be on the wall.";
  }
  return null;
}

/** The stroke with nothing but the wall's fields, for keeping. */
export const wallStroke = (s: Stroke): WallStroke => ({ tool: s.tool, c: s.c, w: s.w, p: s.p, ...(s.r === undefined ? {} : { r: s.r }) });

/** The box a mark covers, with its width around it: [x0, y0, x1, y1]. */
export function markBox(s: Pick<Stroke, "p" | "w">): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < s.p.length; i += 3) {
    x0 = Math.min(x0, s.p[i]);
    x1 = Math.max(x1, s.p[i]);
    y0 = Math.min(y0, s.p[i + 1]);
    y1 = Math.max(y1, s.p[i + 1]);
  }
  const r = s.w * 2;
  return [x0 - r, y0 - r, x1 + r, y1 + r];
}
export const overlaps = (b: number[], x: number, y: number, w: number, h: number) => b[2] >= x && b[0] <= x + w && b[3] >= y && b[1] <= y + h;
