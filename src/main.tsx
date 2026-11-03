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
      { path: "*", element: <main className="wrap piece-missing"><h1>Nothing printed here</h1><p className="serif"><a href="/">Back to Tilo</a></p></main> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
