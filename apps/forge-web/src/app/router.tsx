import { Navigate, createBrowserRouter, createHashRouter } from "react-router-dom";
import { AppShell } from "../components/AppShell.js";
import { CardsPage } from "../pages/cards/CardsPage.js";
import { ComponentsPage } from "../pages/components/ComponentsPage.js";
import { InstallPage } from "../pages/install/InstallPage.js";
import { PlaygroundPage } from "../pages/playground/PlaygroundPage.js";

function routes() {
  return [{
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="cards" replace /> },
      { path: "cards", element: <CardsPage /> },
      { path: "cards/:reference", element: <CardsPage /> },
      { path: "components", element: <ComponentsPage /> },
      { path: "playground", element: <PlaygroundPage /> },
      { path: "install", element: <InstallPage /> },
      { path: "*", element: <Navigate to="cards" replace /> },
    ],
  }];
}

export function createForgeRouter() {
  if (window.location.protocol === "file:") return createHashRouter(routes());
  return createBrowserRouter(routes(), { basename: `${window.__OCTO_BASE_PATH__ ?? ""}/forge` });
}
