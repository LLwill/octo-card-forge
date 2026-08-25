import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { createForgeRouter } from "./app/router.js";
import { RuntimeProvider } from "./app/runtime.js";
import { TooltipProvider } from "./components/ui/tooltip.js";
import "./styles.css";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Forge Web root was not found");

createRoot(root).render(
  <StrictMode>
    <TooltipProvider>
      <RuntimeProvider>
        <RouterProvider router={createForgeRouter()} />
      </RuntimeProvider>
    </TooltipProvider>
  </StrictMode>,
);
