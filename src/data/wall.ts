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

/** the subjects take turns: wall No. 1 is the first, No. 7 the first again */
export const WALL_THEMES: WallSubject[] = [
  { id: "street", title: "The street of windows", prompt: "Every window on this street is empty. Draw who lives behind one." },
  { id: "tree", title: "The tree of everyone", prompt: "The branches are bare. Add a leaf, a bird, a fruit, someone on the swing." },
  { id: "aquarium", title: "The aquarium", prompt: "One fish, and all that water. Fill the tank." },
  { id: "market", title: "The night market", prompt: "The stalls are up and the tables are bare. What's for sale?" },
  { id: "train", title: "The long train", prompt: "Every seat is free. Put a passenger in a window." },
  { id: "sky", title: "The sky over the city", prompt: "The sky is empty. Kites, birds, balloons, weather, a dragon: fill it." },
];
export const themeFor = (no: number) => WALL_THEMES[(Math.max(1, no) - 1) % WALL_THEMES.length];
export const themeById = (id: string) => WALL_THEMES.find((t) => t.id === id) ?? WALL_THEMES[0];

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
