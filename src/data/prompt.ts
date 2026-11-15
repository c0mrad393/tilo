/* The small facts about the samples and the day's subject that pages show without drawing
   anything. The samples themselves (src/data/samples.ts) are drawn only where they appear. */

/* The subject: one at a time, for SUBJECT_DAYS days, with six fixed inks and ten minutes on
   the clock. They are written ahead in SUBJECTS and take turns by the calendar, so nothing has
   to be put up by hand: No. 312 went up at midnight in Tbilisi on 15 November 2026, and every
   SUBJECT_DAYS days the next one follows. The admin panel warns when few are left; past the
   last one they start again from the first, with new numbers. To add more, add them to the
   end of the list (never in the middle: the numbers would move). */

export interface SubjectIdea {
  title: string;
  palette: string[];
  names: string[];
  /** set for a subject that belongs to an event (event.ts) */
  event?: string;
}
export interface Subject extends SubjectIdea {
  no: number;
  minutes: number;
  /** when it went up and when it closes, in ms */
  starts: number;
  ends: number;
  /** how many more are written after this one (below zero: the list has started over) */
  left: number;
}

export const SUBJECT_DAYS = 3;
const FIRST_NO = 312;
/** midnight in Tbilisi (UTC+4, no summer time), 15 November 2026 */
const FIRST_START = Date.UTC(2026, 10, 14, 20);
const SPAN = SUBJECT_DAYS * 86_400_000;

export const SUBJECTS: SubjectIdea[] = [
  { title: "A window at night", palette: ["#1E2A5A", "#F2C14E", "#E26D3D", "#3E7C6B", "#F4EEE0", "#1B1B1B"], names: ["Night navy", "Lamp", "Ember", "Moss", "Moon", "Ink"] },
  // Release week (event.ts): the subject for 18 to 20 November
  { title: "Yourself, as a loading screen", palette: ["#FF4F9A", "#FF8A3D", "#6B3FA0", "#1FA5A0", "#2F6B5A", "#1B1426"], names: ["Sunset pink", "Orange", "Violet", "Teal sea", "Palm", "Night"], event: "release" },
  { title: "Autumn in the park", palette: ["#C9392F", "#E8A33D", "#8C5A3C", "#7FA650", "#6FA8C9", "#2A2724"], names: ["Maple", "Amber", "Bark", "Last green", "Sky", "Ink"] },
  { title: "A cat that owns the place", palette: ["#E26D3D", "#F2D3A0", "#5E6B78", "#A1386B", "#3E7C6B", "#1B1B1B"], names: ["Ginger", "Cream", "Slate", "Cushion", "Fern", "Ink"] },
  { title: "Rain on the old town", palette: ["#4A5A6E", "#9CC6D8", "#E8C79B", "#B5593A", "#F2C14E", "#2A2724"], names: ["Rain cloud", "Puddle", "Plaster", "Roof tile", "Umbrella", "Ink"] },
  { title: "Your shoes, right now", palette: ["#6B4A34", "#2B37D4", "#C9392F", "#8E9096", "#F2C14E", "#1B1E1D"], names: ["Leather", "Denim", "Lace red", "Pavement", "Mustard", "Ink"] },
  { title: "The last tram home", palette: ["#1E2A5A", "#F2C14E", "#C9392F", "#8E9096", "#9CC6D8", "#1B1B1B"], names: ["Night navy", "Lamp", "Tram red", "Rail", "Window glow", "Ink"] },
  { title: "Grandmother's kitchen", palette: ["#B5593A", "#E8C79B", "#3E7C6B", "#2B37D4", "#C9392F", "#2A2724"], names: ["Copper", "Flour", "Herbs", "Enamel blue", "Jam", "Ink"] },
  { title: "A tea glass and a spoon", palette: ["#B5593A", "#9CC6D8", "#F2C14E", "#A1386B", "#8E9096", "#1B1B1B"], names: ["Tea", "Glass", "Lemon", "Saucer", "Spoon", "Ink"] },
  { title: "Someone reading", palette: ["#3B3F8F", "#E8C79B", "#A1386B", "#F2C14E", "#6B4A34", "#1B1B1B"], names: ["Indigo", "Page", "Armchair", "Lamp", "Wood", "Ink"] },
  { title: "The first snow", palette: ["#F4EEE0", "#9CC6D8", "#C9392F", "#3B3F8F", "#8C5A3C", "#1B1E1D"], names: ["Snow", "Ice", "Scarf", "Dusk", "Branch", "Ink"] },
  { title: "A door you'd like to open", palette: ["#2F6B5A", "#B5593A", "#F2C14E", "#E8C79B", "#A1386B", "#1B1B1B"], names: ["Green door", "Brick", "Brass knob", "Plaster", "Flowers", "Ink"] },
  { title: "A dog waiting", palette: ["#A0703C", "#F2D3A0", "#C9392F", "#6FA8C9", "#3E7C6B", "#1B1B1B"], names: ["Fur", "Sand", "Collar", "Sky", "Grass", "Ink"] },
  { title: "Fog in the morning", palette: ["#C8CDD2", "#8E9096", "#5E6B78", "#3E7C6B", "#F4EEE0", "#2A2724"], names: ["Fog", "Grey", "Far hill", "Near tree", "Light", "Ink"] },
  { title: "A toy from when you were small", palette: ["#C9392F", "#2B37D4", "#F2C14E", "#3E7C6B", "#E8C79B", "#1B1B1B"], names: ["Red", "Blue", "Yellow", "Green", "Wood", "Ink"] },
  { title: "A celebration", palette: ["#C9392F", "#F2C14E", "#3E7C6B", "#A1386B", "#2B37D4", "#1B1B1B"], names: ["Wine", "Candle", "Table green", "Ribbon", "Glass", "Ink"] },
  { title: "The night sky from a roof", palette: ["#1E2A5A", "#3B3F8F", "#F2C14E", "#F4EEE0", "#B5593A", "#1B1B1B"], names: ["Night", "Dusk", "Star", "Moon", "Roof", "Ink"] },
  { title: "Mountains after snow", palette: ["#F4EEE0", "#6A7FA0", "#2F4A3A", "#E9B9A6", "#F2C14E", "#1E2A5A"], names: ["Snow", "Shadow blue", "Pine", "Dawn pink", "Sun", "Night"] },
  { title: "A bowl of soup", palette: ["#E8A33D", "#C9392F", "#7FA650", "#2B37D4", "#F4EEE0", "#2A2724"], names: ["Broth", "Pepper", "Parsley", "Bowl", "Steam", "Ink"] },
  { title: "Your favourite mug", palette: ["#2B37D4", "#F4EEE0", "#C98B4E", "#E26D3D", "#A1386B", "#1B1E1D"], names: ["Cobalt", "Glaze", "Coffee", "Chip", "Berry", "Ink"] },
  { title: "A bird on a wire", palette: ["#6FA8C9", "#2A2724", "#E26D3D", "#8C5A3C", "#F4EEE0", "#3E7C6B"], names: ["Sky", "Wire", "Robin", "Wing", "Cloud", "Leaf"] },
  { title: "Tools on a table", palette: ["#8E9096", "#C9392F", "#8C5A3C", "#F2C14E", "#2B37D4", "#1B1B1B"], names: ["Steel", "Handle red", "Workbench", "Brass", "Tape blue", "Ink"] },
  { title: "A creature that doesn't exist", palette: ["#A1386B", "#3E7C6B", "#F2C14E", "#2B37D4", "#E26D3D", "#1B1B1B"], names: ["Magenta", "Scale", "Eye", "Fin", "Fire", "Ink"] },
  { title: "A plant on the sill", palette: ["#3E7C6B", "#7FA650", "#B5593A", "#9CC6D8", "#F4EEE0", "#2A2724"], names: ["Leaf", "New leaf", "Terracotta", "Window", "Light", "Ink"] },
  { title: "The corner shop", palette: ["#C9392F", "#F2C14E", "#3E7C6B", "#9CC6D8", "#8C5A3C", "#1B1B1B"], names: ["Sign red", "Lemons", "Awning", "Glass", "Crates", "Ink"] },
  { title: "A face in a crowd", palette: ["#E26D3D", "#2B37D4", "#3E7C6B", "#F2C14E", "#8E9096", "#1B1B1B"], names: ["Coat", "Hat", "Jacket", "Scarf", "Crowd", "Ink"] },
  { title: "A bridge over the river", palette: ["#5E7E8C", "#8E9096", "#3E7C6B", "#E8C79B", "#F2C14E", "#1B1B1B"], names: ["River", "Stone", "Bank", "Evening", "Lamps", "Ink"] },
  { title: "Bread, just baked", palette: ["#C98B4E", "#F2D3A0", "#8C5A3C", "#F4EEE0", "#C9392F", "#2A2724"], names: ["Crust", "Crumb", "Board", "Flour", "Cloth", "Ink"] },
  { title: "Something you lost", palette: ["#6B645A", "#2B37D4", "#C9392F", "#F2C14E", "#9CC6D8", "#1B1B1B"], names: ["Dust", "Blue", "Red", "Gold", "Pale", "Ink"] },
  { title: "A bicycle", palette: ["#2B37D4", "#8E9096", "#C9392F", "#F2C14E", "#3E7C6B", "#1B1E1D"], names: ["Frame", "Spokes", "Bell", "Basket", "Hedge", "Ink"] },
  { title: "Your bag, open", palette: ["#8C5A3C", "#2B37D4", "#C9392F", "#F2C14E", "#3E7C6B", "#1B1B1B"], names: ["Leather", "Notebook", "Wallet", "Keys", "Apple", "Ink"] },
  { title: "Shadows at five o'clock", palette: ["#E8A33D", "#5E6B78", "#E9B9A6", "#3E7C6B", "#F4EEE0", "#2A2724"], names: ["Low sun", "Shadow", "Wall pink", "Leaf", "Light", "Ink"] },
  { title: "A storm coming", palette: ["#3A3E58", "#6A7FA0", "#F2C14E", "#7FA650", "#F4EEE0", "#1B1B1B"], names: ["Cloud", "Rain", "Lightning", "Field", "Flash", "Ink"] },
  { title: "Lemons", palette: ["#F2C14E", "#E8A33D", "#7FA650", "#2B37D4", "#F4EEE0", "#2A2724"], names: ["Lemon", "Rind", "Leaf", "Cloth", "Light", "Ink"] },
  { title: "A chair with a story", palette: ["#8C5A3C", "#A1386B", "#3E7C6B", "#F2C14E", "#E8C79B", "#1B1B1B"], names: ["Oak", "Velvet", "Room", "Light", "Wall", "Ink"] },
  { title: "Breakfast on a balcony", palette: ["#E8A33D", "#C9392F", "#7FA650", "#6FA8C9", "#8C5A3C", "#2A2724"], names: ["Yolk", "Tomato", "Basil", "Morning sky", "Bread crust", "Ink"] },
  { title: "Dancing", palette: ["#A1386B", "#E26D3D", "#3B3F8F", "#F2C14E", "#3E7C6B", "#1B1B1B"], names: ["Skirt", "Spin", "Night", "Spotlight", "Sash", "Ink"] },
  { title: "The view from a bus seat", palette: ["#6FA8C9", "#8E9096", "#3E7C6B", "#E9B9A6", "#F2C14E", "#2A2724"], names: ["Glass", "Road", "Trees", "Blush", "Ticket", "Ink"] },
  { title: "Your street at 7 a.m.", palette: ["#E9B9A6", "#8E9096", "#F2C14E", "#3E7C6B", "#5E6B78", "#1B1B1B"], names: ["Dawn", "Pavement", "First light", "Tree", "Shade", "Ink"] },
  { title: "A tiny house", palette: ["#B5593A", "#E8C79B", "#3E7C6B", "#F2C14E", "#6FA8C9", "#1B1B1B"], names: ["Roof", "Walls", "Garden", "Window light", "Sky", "Ink"] },
  { title: "Washing on the line", palette: ["#6FA8C9", "#C9392F", "#F2C14E", "#A1386B", "#F4EEE0", "#2A2724"], names: ["Sky", "Shirt", "Towel", "Dress", "Sheet", "Ink"] },
  { title: "Music you can see", palette: ["#2B37D4", "#E26D3D", "#F2C14E", "#A1386B", "#3E7C6B", "#1B1B1B"], names: ["Bass", "Brass", "Bright", "Strings", "Drum", "Ink"] },
  { title: "A walk in the forest", palette: ["#2F4A3A", "#7FA650", "#8C5A3C", "#E8A33D", "#A1386B", "#1B1B1B"], names: ["Pine", "Moss", "Path", "Sun through", "Berry", "Ink"] },
  { title: "A fruit stall", palette: ["#C9392F", "#E8A33D", "#7FA650", "#6B3A6B", "#F2C14E", "#2A2724"], names: ["Pomegranate", "Apricot", "Fig leaf", "Plum", "Peach", "Ink"] },
  { title: "Blossom", palette: ["#F2B8C6", "#F4EEE0", "#8C5A3C", "#7FA650", "#6FA8C9", "#2A2724"], names: ["Blossom", "Petal", "Branch", "New leaf", "Sky", "Ink"] },
  { title: "A boat", palette: ["#2B6FA8", "#C9392F", "#F4EEE0", "#E8C79B", "#F2C14E", "#1B1E1D"], names: ["Sea", "Hull", "Sail", "Deck", "Buoy", "Ink"] },
  { title: "The moon over the sea", palette: ["#1E2A5A", "#2B6FA8", "#F4EEE0", "#9CC6D8", "#F2C14E", "#1B1B1B"], names: ["Night", "Sea", "Moon", "Glint", "Ship light", "Ink"] },
  { title: "The sea at noon", palette: ["#2B6FA8", "#6FC2C9", "#F2D3A0", "#F4EEE0", "#E26D3D", "#1B1E1D"], names: ["Deep", "Shallows", "Sand", "Foam", "Towel", "Ink"] },
  { title: "Ice cream on a hot day", palette: ["#F2B8C6", "#F4E3B0", "#6B4A34", "#7FC2A8", "#E8A33D", "#1B1B1B"], names: ["Strawberry", "Vanilla", "Chocolate", "Mint", "Cone", "Ink"] },
  { title: "Home", palette: ["#E26D3D", "#E8C79B", "#3E7C6B", "#2B37D4", "#F2C14E", "#1B1B1B"], names: ["Hearth", "Wall", "Garden", "Door", "Window", "Ink"] },
  { title: "Something steaming", palette: ["#C98B4E", "#F4EEE0", "#B23A2E", "#3E7C6B", "#5A3A26", "#1B1B1B"], names: ["Tea", "Steam", "Clay cup", "Mint", "Table", "Ink"] },
];

/** past the end, the list starts over without the events' subjects */
const REGULAR = SUBJECTS.filter((t) => !t.event);
const make = (k: number): Subject => ({
  no: FIRST_NO + k,
  ...(k < SUBJECTS.length ? SUBJECTS[k] : REGULAR[(k - SUBJECTS.length) % REGULAR.length]),
  minutes: 10,
  starts: FIRST_START + k * SPAN,
  ends: FIRST_START + (k + 1) * SPAN,
  left: SUBJECTS.length - 1 - k,
});
/** the subject up at a moment (now, by default) */
export const subjectAt = (t = Date.now()) => make(Math.max(0, Math.floor((t - FIRST_START) / SPAN)));
/** a subject by its number; null before the first */
export const subjectNo = (no: number) => (Number.isInteger(no) && no >= FIRST_NO ? make(no - FIRST_NO) : null);
/** the next `n` subjects after the one up now, for the admin panel */
export const subjectsAhead = (n: number, t = Date.now()) => {
  const k = Math.max(0, Math.floor((t - FIRST_START) / SPAN));
  return Array.from({ length: n }, (_, i) => make(k + 1 + i));
};

/** the subject up when the page opened */
export const PROMPT = subjectAt();
/** the first subject, the one Tilo's sample entries were drawn for */
export const FIRST_SUBJECT = make(0);

/** who the samples are credited to: the @tilo account on the server */
export const SAMPLE_BY = "tilo";
export const SAMPLE_ACCOUNT = "71100000-0000-4000-8000-000000000001";

/** A sample's id in the shared gallery, where the server's seed publishes it as @tilo
    (server/seed/samples). With accounts on, its page and remix credit go there. */
export const publishedSample = (id: string) => `tilo${id}`;

export const STAMPS = ["Bold", "Moody", "Calm", "Colour", "Clean line", "Patient", "Funny", "Remix me"] as const;
export const STAMP_COLOR: Record<string, string> = {
  Bold: "#B23A2E", Moody: "#3B3F8F", Calm: "#2F6B5A", Colour: "#99520F",
  "Clean line": "#1B1E1D", Patient: "#6B4C2E", Funny: "#A1386B", "Remix me": "#2B37D4",
};
