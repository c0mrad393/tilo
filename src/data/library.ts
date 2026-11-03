import { decode, encode } from "../engine/codec";
import type { PaperId } from "../engine/paper";
import type { LayerDef, Stroke } from "../engine/stroke";

/* Your sheets: every drawing you start, kept in IndexedDB on this device. Strokes are stored
   as a v2 recording (see engine/codec), with a small picture for the library page. */

export interface Guides {
  /** 0 off, 1 one-point, 2 two-point */
  mode: 0 | 1 | 2;
  vp: [number, number][];
  snap: boolean;
}
export const NO_GUIDES: Guides = { mode: 0, vp: [[800, 520], [-300, 520]], snap: true };

export interface SheetMeta {
  id: string;
  title: string;
  created: number;
  updated: number;
  ms: number;
  count: number;
  paper: PaperId;
  remixOf?: string;
  /** drawing to the day's subject, with its six inks */
  subject?: boolean;
  /** the gallery piece it was pinned as */
  pinned?: string;
  thumb?: Blob;
}
export interface Sheet extends SheetMeta {
  strokes: Stroke[];
  layers: LayerDef[];
  guides: Guides;
}
interface Row extends SheetMeta {
  data: Uint8Array;
  layers: LayerDef[];
  guides: Guides;
}

const DB = "tilo", STORE = "sheets";
let dbp: Promise<IDBDatabase> | null = null;
function db() {
  return (dbp ??= new Promise<IDBDatabase>((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" }).createIndex("updated", "updated");
    r.onsuccess = () => res(r.result);
    r.onerror = () => {
      dbp = null;
      rej(r.error);
    };
  }));
}
function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((res, rej) => {
        const t = d.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        t.oncomplete = () => res(req ? req.result : (undefined as T));
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error);
      }),
  );
}

const listeners = new Set<() => void>();
/** Calls `f` whenever a sheet is saved or removed; returns the unsubscribe. */
export const onLibraryChange = (f: () => void) => {
  listeners.add(f);
  return () => void listeners.delete(f);
};
const changed = () => listeners.forEach((f) => f());

const toSheet = ({ data, ...row }: Row): Sheet => ({ ...row, strokes: decode(data), guides: row.guides ?? NO_GUIDES });

export const newSheetId = () => "s-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function blankSheet(over: Partial<Sheet> = {}): Sheet {
  const now = Date.now();
  return { id: newSheetId(), title: "", created: now, updated: now, ms: 0, count: 0, paper: "smooth", strokes: [], layers: [], guides: NO_GUIDES, ...over };
}

export const library = {
  /** Every sheet, newest first, without its strokes. */
  async list(): Promise<SheetMeta[]> {
    const rows = await tx<Row[]>("readonly", (s) => s.getAll());
    return rows.map(({ data: _data, layers: _l, guides: _g, ...meta }) => meta).sort((a, b) => b.updated - a.updated);
  },
  async get(id: string): Promise<Sheet | undefined> {
    const row = await tx<Row | undefined>("readonly", (s) => s.get(id));
    return row ? toSheet(row) : undefined;
  },
  async put(sheet: Sheet) {
    const { strokes, ...rest } = sheet;
    const row: Row = { ...rest, count: strokes.length, data: encode(strokes) };
    await tx("readwrite", (s) => s.put(row));
    changed();
  },
  async remove(id: string) {
    await tx("readwrite", (s) => s.delete(id));
    changed();
  },
  async duplicate(id: string) {
    const s = await library.get(id);
    if (!s) return;
    const now = Date.now();
    const copy = { ...s, id: newSheetId(), title: (s.title || "Untitled") + " (copy)", created: now, updated: now, pinned: undefined };
    await library.put(copy);
    return copy;
  },
};

/* the sheet the studio opens when you come back to it */
const LAST = "tilo.lastSheet";
export const lastSheet = {
  get: () => {
    try {
      return localStorage.getItem(LAST);
    } catch {
      return null;
    }
  },
  set: (id: string | null) => {
    try {
      if (id) localStorage.setItem(LAST, id);
      else localStorage.removeItem(LAST);
    } catch {
      // storage off: the studio starts a fresh sheet next time
    }
  },
};

/** Moves the single draft that 0.4 kept in localStorage into the library, once. */
export async function migrateDraft() {
  try {
    const raw = localStorage.getItem("tilo.draft");
    if (!raw) return;
    const strokes = JSON.parse(raw) as Stroke[];
    if (Array.isArray(strokes) && strokes.length) {
      const sheet = blankSheet({
        strokes,
        ms: JSON.parse(localStorage.getItem("tilo.draftTime") || "0") || 0,
        layers: JSON.parse(localStorage.getItem("tilo.draftLayers") || "[]") || [],
      });
      await library.put(sheet);
      lastSheet.set(sheet.id);
    }
    ["tilo.draft", "tilo.draftTime", "tilo.draftLayers"].forEach((k) => localStorage.removeItem(k));
  } catch {
    // a broken draft is left where it is rather than lost
  }
}
