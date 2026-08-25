import { Navigate, createBrowserRouter, createHashRouter } from "react-router-dom";
import { AppShell } from "../components/AppShell.js";
import { CardsPage } from "../pages/cards/CardsPage.js";
import { PlaceholderPage } from "../pages/PlaceholderPage.js";

function routes() {
  return [{
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="cards" replace /> },
      { path: "cards", element: <CardsPage /> },
      { path: "cards/:reference", element: <CardsPage /> },
      { path: "components", element: <PlaceholderPage title="Components" description="Render Profile 组件、工具与 Pattern 目录。" /> },
      { path: "playground", element: <PlaceholderPage title="Playground" description="Adaptive Card JSON 与 Template Data 预览工作台。" /> },
      { path: "install", element: <PlaceholderPage title="Install" description="CLI、Skill 与 Render Profile 安装信息。" /> },
      { path: "*", element: <Navigate to="cards" replace /> },
    ],
  }];
}

export function createForgeRouter() {
  if (window.location.protocol === "file:") return createHashRouter(routes());
  return createBrowserRouter(routes(), { basename: `${window.__OCTO_BASE_PATH__ ?? ""}/forge` });
}
