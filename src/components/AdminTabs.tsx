import { NavLink } from "react-router";

/* The admin panel's sections, over the mods' queue and every admin page. */
const TABS: [string, string][] = [
  ["/mod", "Queue"],
  ["/admin", "Overview"],
  ["/admin/members", "Members"],
  ["/admin/claims", "Claims"],
  ["/admin/invites", "Invites"],
  ["/admin/pieces", "Pieces"],
  ["/admin/feedback", "Feedback"],
  ["/admin/errors", "Errors"],
  ["/admin/wall", "Wall"],
  ["/admin/log", "Log"],
];

export function AdminTabs() {
  return (
    <nav className="admin-tabs" aria-label="Admin">
      {TABS.map(([to, name]) => (
        <NavLink key={to} to={to} end viewTransition>{name}</NavLink>
      ))}
    </nav>
  );
}
