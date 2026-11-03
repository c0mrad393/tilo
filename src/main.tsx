import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource/martian-mono/latin-400.css";
import "@fontsource/martian-mono/latin-500.css";
// the handwriting face ships thousands of Korean glyphs; Tilo only needs its Latin set
import "@fontsource/nanum-pen-script/latin-400.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/materials.css";
import "./styles/app.css";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Gallery } from "./pages/Gallery";
import { PiecePage } from "./pages/PiecePage";
import { Studio } from "./pages/Studio";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/gallery", element: <Gallery /> },
      { path: "/piece/:id", element: <PiecePage /> },
      { path: "/studio", element: <Studio /> },
      { path: "*", element: <main className="wrap piece-missing"><h1>Nothing pinned here</h1><p><a href="/">Back to Tilo</a></p></main> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
