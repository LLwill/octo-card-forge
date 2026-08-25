import { Boxes, Braces, CreditCard, Download, Github, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useRuntime } from "../app/runtime.js";

const navigation = [
  { to: "/cards", label: "Cards", icon: CreditCard },
  { to: "/components", label: "Components", icon: Boxes },
  { to: "/playground", label: "Playground", icon: Braces },
  { to: "/install", label: "Install", icon: Download },
];

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const { runtime } = useRuntime();
  return (
    <div className={collapsed ? "forge-shell nav-collapsed" : "forge-shell"}>
      <aside className="primary-nav">
        <div className="brand-lockup"><span className="brand-mark" aria-hidden="true">O</span><div className="brand-copy"><strong>Octo Card Forge</strong><span>{runtime?.mode === "workspace" ? "Workspace" : "Published catalog"}</span></div></div>
        <nav aria-label="Forge navigation">
          {navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => isActive ? "nav-item active" : "nav-item"}><Icon size={18} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span></NavLink>)}
        </nav>
        <div className="nav-footer">
          <a className="nav-item" href="https://github.com/LLwill/octo-card-forge" target="_blank" rel="noreferrer"><Github size={18} strokeWidth={1.8} aria-hidden="true" /><span>Repository</span></a>
          <button className="nav-collapse" type="button" onClick={() => setCollapsed((value) => !value)} title={collapsed ? "Expand navigation" : "Collapse navigation"}>{collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}<span>{collapsed ? "Expand" : "Collapse"}</span></button>
        </div>
      </aside>
      <div className="app-content"><Outlet /></div>
    </div>
  );
}
