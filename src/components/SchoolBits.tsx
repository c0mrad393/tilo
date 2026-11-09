import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { at, schoolApi, STATUS_LABEL, TAGS, useDemo, type SchoolApi, type Work } from "../data/school";

/* Pieces the schools pages share. */

/** The school API for this page: the demo under /demo, the real one elsewhere. */
export function useSchoolApi() {
  const demo = useDemo();
  const [api, setApi] = useState<SchoolApi | null>(null);
  useEffect(() => {
    let live = true;
    schoolApi(demo).then((a) => live && setApi(a));
    return () => {
      live = false;
    };
  }, [demo]);
  return { api, demo };
}

/** A pupil's name with their colour, the way pupils find themselves in a list. */
export function Tag({ name, tag, big = false }: { name: string; tag: number; big?: boolean }) {
  return (
    <span className={`tag${big ? " tag-big" : ""}`} style={{ ["--tag" as string]: TAGS[tag % TAGS.length] }}>
      <i aria-hidden="true">{name.trim()[0]?.toUpperCase()}</i>
      {name}
    </span>
  );
}

export function StatusChip({ work }: { work: Pick<Work, "status" | "check"> }) {
  if (work.check === "held") return <span className="chip-s is-held">Held by the image check</span>;
  return <span className={`chip-s is-${work.status}`}>{STATUS_LABEL[work.status]}</span>;
}

/** The strip along the top of every demo page. */
export function DemoBar() {
  const nav = useNavigate();
  const again = async () => {
    const m = await import("../data/school-demo");
    m.resetDemo();
    nav("/demo", { viewTransition: true });
  };
  return (
    <aside className="demo-bar" aria-label="About the demo">
      <p>
        <b>Demo school.</b> <span className="opt">The school, pupils and drawings are made up, and nothing you do here leaves this browser.</span>
      </p>
      <nav aria-label="Demo pages">
        <Link to="/demo/teach" viewTransition>Teacher</Link>
        <Link to="/demo/class" viewTransition>Pupil</Link>
        <Link to="/demo/show/our-houses" viewTransition>A show</Link>
        <button type="button" className="link-btn" onClick={again}>Start again</button>
      </nav>
    </aside>
  );
}

export function Waiting({ text = "Opening…" }: { text?: string }) {
  return <p className="page-wait serif" role="status">{text}</p>;
}

/** A link inside the schools area, under /demo in the demo. */
export function SLink({ to, ...rest }: React.ComponentProps<typeof Link> & { to: string }) {
  const demo = useDemo();
  return <Link to={at(demo, to)} viewTransition {...rest} />;
}
