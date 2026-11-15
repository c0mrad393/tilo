import type { Sketch, Pt } from "../engine/sketch";
import { ellipse } from "./art";
import { PAPER } from "./wall";

/* The little helpers the wall's outlines (wall-art.ts, wall-art-more.ts) are drawn with. */

export const INK = "#2A2724", SOFT = "#6B645A", WOOD = "#8C5A3C", DARKWOOD = "#5A3A26";
/** paper laid over what's under it: a space left empty on purpose */
export const empty = (S: Sketch, pts: Pt[]) => S.lasso(pts, PAPER);
export const box = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
export const arch = (x: number, y: number, w: number, h: number): Pt[] => [
  [x, y + h],
  [x, y + w / 2],
  ...ellipse(x + w / 2, y + w / 2, w / 2, w / 2, 16, Math.PI, Math.PI * 2),
  [x + w, y + h],
];
/** a light coat of colour, laid down the way a wash would be */
export const tint = (S: Sketch, pts: Pt[], c: string, a = 0.32) => {
  const was = S.alpha;
  S.alpha = a;
  S.lasso(pts, c);
  S.alpha = was;
};
/** a closed outline */
export const ring = (S: Sketch, pts: Pt[], c = INK, w = 4, j = 0.8, tool: "ink" | "pencil" | "brushpen" = "ink") => S.poly([...pts, pts[0]], tool, c, w, j);
/** an empty frame: paper inside, a line round it */
export const hole = (S: Sketch, pts: Pt[], c = INK, w = 4, j = 0.8) => {
  empty(S, pts);
  ring(S, pts, c, w, j);
};
/** a shape filled with colour and outlined */
export const shape = (S: Sketch, pts: Pt[], fill: string, a = 0.6, c = INK, w = 4, j = 0.8) => {
  tint(S, pts, fill, a);
  ring(S, pts, c, w, j);
};
