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
          { path: "/library", lazy: () => import("./pages/Library").then((m) => ({ Component: m.Library })) },
          { path: "/account", lazy: () => import("./pages/Account").then((m) => ({ Component: m.Account })) },
          { path: "/u/:handle", lazy: () => import("./pages/Profile").then((m) => ({ Component: m.Profile })) },
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
