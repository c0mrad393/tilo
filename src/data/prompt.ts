/* The small facts about the samples and the day's subject that pages show without drawing
   anything. The samples themselves (src/data/samples.ts) are drawn only where they appear. */

export const PROMPT = {
  no: 312,
  title: "A window at night",
  palette: ["#1E2A5A", "#F2C14E", "#E26D3D", "#3E7C6B", "#F4EEE0", "#1B1B1B"],
  names: ["Night navy", "Lamp", "Ember", "Moss", "Moon", "Ink"],
  minutes: 10,
};

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
