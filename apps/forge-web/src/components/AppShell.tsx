import { Boxes, Braces, CreditCard, Download, Github } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { useRuntime } from "../app/runtime.js";
import { cn } from "../lib/utils.js";
import { Badge } from "./ui/badge.js";

const navigation = [
  { to: "/cards", label: "Cards", icon: CreditCard },
  { to: "/components", label: "Components", icon: Boxes },
  { to: "/playground", label: "Playground", icon: Braces },
  { to: "/install", label: "Install", icon: Download },
];

export function AppShell() {
  const { runtime } = useRuntime();
  const mode = runtime?.mode === "workspace" ? "Workspace" : "Published";

  return (
    <div className="min-h-screen bg-background md:grid md:grid-cols-[96px_minmax(0,1fr)]">
      <aside className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur md:sticky md:inset-auto md:top-0 md:flex md:h-screen md:flex-col md:border-r md:border-t-0">
        <div className="hidden h-24 flex-col items-center justify-center gap-2 border-b md:flex">
          <div className="grid size-10 place-items-center rounded-lg bg-primary text-base font-bold text-primary-foreground shadow-sm">O</div>
          <span className="text-[10px] font-semibold tracking-wide text-muted-foreground">FORGE</span>
        </div>

        <nav className="grid h-16 grid-cols-4 gap-1 p-2 md:h-auto md:flex-1 md:grid-cols-1 md:content-start md:gap-2 md:px-2 md:py-5" aria-label="Forge navigation">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn(
                "group relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-[10px] font-medium text-muted-foreground transition-colors",
                "hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-16 md:px-2",
                isActive && "bg-primary/10 text-primary",
              )}
            >
              {({ isActive }) => (
                <>
                  <Icon className="size-5" strokeWidth={isActive ? 2.2 : 1.8} aria-hidden="true" />
                  <span className="whitespace-nowrap">{label}</span>
                  {isActive ? <span className="absolute bottom-0 h-0.5 w-7 rounded-full bg-primary md:inset-y-3 md:left-0 md:h-auto md:w-0.5" aria-hidden="true" /> : null}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="hidden border-t px-2 py-4 md:grid md:gap-3">
          <Badge variant="secondary" className="mx-auto max-w-[72px] justify-center overflow-hidden px-2 text-[10px]">{mode}</Badge>
          <a
            href="https://github.com/LLwill/octo-card-forge"
            target="_blank"
            rel="noreferrer"
            className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Github className="size-5" strokeWidth={1.8} aria-hidden="true" />
            Repository
          </a>
        </div>
      </aside>

      <div className="min-w-0 pb-16 md:pb-0"><Outlet /></div>
    </div>
  );
}
