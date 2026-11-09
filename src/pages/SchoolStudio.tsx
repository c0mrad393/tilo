import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { useSchoolApi, Waiting } from "../components/SchoolBits";
import { blankSheet } from "../data/library";
import { AGES, at, dueLabel, usePupil, type OpenWork } from "../data/school";
import { Studio, type Seat } from "./Studio";

/* /class/draw/:work: the studio, opened on a pupil's work. It loads the work from the class
   (the server, or the demo), and saves back there as the pupil draws. */
export function SchoolStudio() {
  const { work = "" } = useParams();
  const { api, demo } = useSchoolApi();
  const me = usePupil(demo);
  const [open, setOpen] = useState<OpenWork | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (api && me) api.openWork(work).then(setOpen, (e) => setError(e instanceof Error ? e.message : "The drawing didn't open."));
  }, [api, me, work]);

  const seat = useMemo<Seat | null>(() => {
    if (!api || !open) return null;
    const { work: w, task, ages } = open;
    return {
      back: at(demo, "/class"),
      title: task?.title ?? "My drawing",
      brief: task?.brief ?? "",
      due: task?.due ? dueLabel(task.due) : "",
      palette: task?.palette ?? null,
      simple: AGES[ages].simple,
      note: w.status === "back" ? w.note : "",
      save: (d) => api.saveWork(w.id, d),
      handIn: () => api.handIn(w.id),
    };
  }, [api, open, demo]);
  const sheet = useMemo(() => {
    if (!open) return null;
    const { work: w, strokes } = open;
    return blankSheet({ id: w.id, title: w.title === (open.task?.title ?? "My drawing") ? "" : w.title, strokes, layers: w.layers, paper: w.paper, shape: w.shape, ms: w.minutes * 60000, count: strokes.length });
  }, [open]);

  if (!me)
    return (
      <main className="kid-main" id="main">
        <p className="kid-lede">Sign in to your class first.</p>
        <Link className="btn btn-ink" to={at(demo, "/class")}>Sign in</Link>
      </main>
    );
  if (error)
    return (
      <main className="kid-main" id="main">
        <p className="kid-error" role="alert">{error}</p>
        <Link className="btn btn-line" to={at(demo, "/class")}>Back to your class</Link>
      </main>
    );
  if (!seat || !sheet) return <Waiting />;
  return <Studio key={sheet.id} sheet={sheet} seat={seat} />;
}
