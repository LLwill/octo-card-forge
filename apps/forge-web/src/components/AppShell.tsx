import { Boxes, CreditCard, Download, GalleryVerticalEnd } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";
import { cn } from "../lib/utils.js";

const navigation = [
  { to: "/", label: "能力", icon: GalleryVerticalEnd, end: true },
  { to: "/cards", label: "卡片案例", icon: CreditCard },
  { to: "/components", label: "设计规范", icon: Boxes },
  { to: "/install", label: "开始使用", icon: Download },
];

export function AppShell() {
  return (
    <div className="min-h-screen bg-background md:grid md:grid-cols-[84px_minmax(0,1fr)]">
      <aside className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur md:sticky md:inset-auto md:top-0 md:flex md:h-screen md:flex-col md:border-r md:border-t-0">
        <div className="hidden h-24 flex-col items-center justify-center gap-2 border-b md:flex">
          <div className="grid size-10 place-items-center rounded-md bg-primary text-base font-bold text-primary-foreground">O</div>
          <span className="text-[10px] font-semibold tracking-wide text-muted-foreground">FORGE</span>
        </div>

        <nav className="grid h-16 grid-cols-4 gap-1 p-2 md:h-auto md:flex-1 md:grid-cols-1 md:content-start md:gap-2 md:px-2 md:py-5" aria-label="主导航">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn(
                "group relative flex min-w-0 flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium text-muted-foreground transition-colors",
                "hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 md:min-h-[68px] md:px-2",
                isActive && "text-foreground",
              )}
            >
              {({ isActive }) => (
                <>
                  <Icon className="size-5" strokeWidth={isActive ? 2.2 : 1.8} aria-hidden="true" />
                  <span className="whitespace-nowrap">{label}</span>
                  {isActive ? <span className="absolute bottom-0 h-0.5 w-7 bg-[var(--signal)] md:inset-y-3 md:left-0 md:h-auto md:w-0.5" aria-hidden="true" /> : null}
                </>
              )}
            </NavLink>
          ))}
        </nav>

      </aside>

      <div className="min-w-0 pb-16 md:pb-0"><Outlet /></div>
    </div>
  );
}
