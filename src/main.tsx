import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
// width and weight axes: Archivo runs from poster-condensed to wide in one file
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/newsreader/opsz.css";
import "@fontsource-variable/newsreader/opsz-italic.css";
import "@fontsource/martian-mono/latin-400.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/materials.css";
import "./styles/app.css";
import { Layout } from "./components/Layout";
import { startAccounts } from "./data/account";
import { watchErrors } from "./data/beta";
import { NotFound, PageError } from "./pages/Errors";

/* Each page is its own file, fetched when it is first opened, so the first visit only loads
   what it shows. The studio, the heaviest, never loads for someone who only browses. */
const router = createBrowserRouter([
  {
    element: <Layout />,
    // the error screen sits inside the layout, so the masthead stays when a page fails
    children: [
      {
        ErrorBoundary: PageError,
        HydrateFallback: () => null,
        children: [
          { path: "/", lazy: () => import("./pages/Home").then((m) => ({ Component: m.Home })) },
          { path: "/gallery", lazy: () => import("./pages/Gallery").then((m) => ({ Component: m.Gallery })) },
          { path: "/piece/:id", lazy: () => import("./pages/PiecePage").then((m) => ({ Component: m.PiecePage })) },
          {
            path: "/studio",
            lazy: () => import("./pages/Studio").then((m) => ({ Component: m.StudioRoute, loader: m.studioLoader, shouldRevalidate: m.studioShouldRevalidate })),
          },
          { path: "/wall", lazy: () => import("./pages/WallPage").then((m) => ({ Component: m.WallPage })) },
          { path: "/wall/past", lazy: () => import("./pages/WallPage").then((m) => ({ Component: m.PastWalls })) },
          { path: "/wall/:no", lazy: () => import("./pages/WallPage").then((m) => ({ Component: m.PastWallPage })) },
          { path: "/library", lazy: () => import("./pages/Library").then((m) => ({ Component: m.Library })) },
          { path: "/account", lazy: () => import("./pages/Account").then((m) => ({ Component: m.Account })) },
          { path: "/join", lazy: () => import("./pages/Join").then((m) => ({ Component: m.Join })) },
          { path: "/u/:handle", lazy: () => import("./pages/Profile").then((m) => ({ Component: m.Profile })) },
          { path: "/mod", lazy: () => import("./pages/Queue").then((m) => ({ Component: m.Queue })) },
          { path: "/admin/:tab?", lazy: () => import("./pages/Admin").then((m) => ({ Component: m.Admin })) },
          { path: "/terms", lazy: () => import("./pages/Legal").then((m) => ({ Component: m.Terms })) },
          { path: "/privacy", lazy: () => import("./pages/Legal").then((m) => ({ Component: m.Privacy })) },
          { path: "/takedown", lazy: () => import("./pages/Legal").then((m) => ({ Component: m.Takedown })) },
          { path: "/support", lazy: () => import("./pages/Support").then((m) => ({ Component: m.Support })) },
          { path: "/proof", lazy: () => import("./pages/Proof").then((m) => ({ Component: m.Proof })) },
          // Tilo for schools; the same pages under /demo run the demo school in the browser
          { path: "/schools", lazy: () => import("./pages/Class").then((m) => ({ Component: m.Schools })) },
          { path: "/demo", lazy: () => import("./pages/Class").then((m) => ({ Component: m.DemoHome })) },
          ...["", "/demo"].flatMap((d) => [
            { path: `${d}/teach`, lazy: () => import("./pages/Teach").then((m) => ({ Component: m.Teach })) },
            { path: `${d}/teach/:cls/:tab?`, lazy: () => import("./pages/Teach").then((m) => ({ Component: m.ClassRoom })) },
            { path: `${d}/class`, lazy: () => import("./pages/Class").then((m) => ({ Component: m.ClassPage })) },
            { path: `${d}/class/draw/:work`, lazy: () => import("./pages/SchoolStudio").then((m) => ({ Component: m.SchoolStudio })) },
            { path: `${d}/show/:token`, lazy: () => import("./pages/Class").then((m) => ({ Component: m.Show })) },
          ]),
          { path: "*", Component: NotFound },
        ],
      },
    ],
  },
]);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  // keeps Tilo working offline; see sw.js, which the build writes with the list of files
  addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

// checks for a saved session once the page is up (only when accounts are on)
startAccounts();
// what breaks and no page catches reaches the admin panel (only when accounts are on)
watchErrors();
