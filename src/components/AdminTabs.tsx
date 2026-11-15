import { useEffect, useState } from "react";
import { NavLink } from "react-router";
import { type Stats, stats } from "../data/admin";

/* The admin panel's sections, in four groups, over the mods' queue and every admin page.
   A number on a tab is what waits there for someone. */
type Tab = [to: string, name: string, waiting?: (s: Stats) => number];
const GROUPS: [string, Tab[]][] = [
  [
    "Start",
    [
      ["/admin", "Overview"],
      ["/admin/visitors", "Visitors"],
      ["/admin/schedule", "Coming up"],
    ],
  ],
  [
    "Moderation",
    [
      ["/mod", "Queue", (s) => s.queue],
      ["/admin/claims", "Claims", (s) => s.claims],
      ["/admin/pieces", "Pieces"],
      ["/admin/wall", "Wall"],
    ],
  ],
  [
    "People",
    [
      ["/admin/members", "Members"],
      ["/admin/invites", "Invites", (s) => s.waiting_list],
      ["/admin/schools", "Schools", (s) => s.schools_pending],
    ],
  ],
  [
    "Site",
    [
      ["/admin/feedback", "Feedback", (s) => s.feedback],
      ["/admin/errors", "Errors", (s) => s.errors],
      ["/admin/settings", "Settings"],
      ["/admin/log", "Log"],
    ],
  ],
];

// the numbers, shared by every tab bar and fetched again on each visit
let last: Stats | null = null;

export function AdminTabs() {
  const [s, setS] = useState<Stats | null>(last);
  useEffect(() => {
    stats().then((x) => setS((last = x)), () => {});
  }, []);
  return (
    <nav className="admin-tabs" aria-label="Admin">
      {GROUPS.map(([group, tabs]) => (
        <div key={group} className="admin-tab-group" role="group" aria-labelledby={`admin-group-${group}`}>
          <span id={`admin-group-${group}`} className="admin-tab-label kicker">{group}</span>
          <div className="admin-tab-row">
            {tabs.map(([to, name, waiting]) => {
              const n = s && waiting ? waiting(s) : 0;
              return (
                <NavLink key={to} to={to} end viewTransition>
                  {name}
                  {n > 0 && <span className="admin-count"><span className="sr-only">, waiting: </span>{n}</span>}
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
