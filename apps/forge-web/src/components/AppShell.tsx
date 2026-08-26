import { Boxes } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useRuntime } from "../app/runtime.js";
import { cn } from "../lib/utils.js";

const navigation = [
  { to: "/cards", label: "卡片库" },
  { to: "/components", label: "组件规范" },
  { to: "/playground", label: "预览调试" },
  { to: "/install", label: "安装接入" },
];

export function AppShell() {
  const { runtime } = useRuntime();
  const modeLabel = runtime?.mode === "published" ? "已发布目录" : "本地工作区";

  return (
    <div className="forge-app-shell">
      <header className="forge-topbar">
        <Link className="forge-brand" to="/" aria-label="Octo Card Forge 首页">
          <span className="forge-brand-mark"><Boxes aria-hidden="true" /></span>
          <strong>Octo Card Forge</strong>
        </Link>

        <nav className="forge-global-nav" aria-label="主导航">
          {navigation.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => cn(
                "forge-global-link",
                isActive && "active",
              )}
            >
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="forge-runtime"><i aria-hidden="true" /><span>{modeLabel}</span><small>已连接</small></div>
      </header>

      <div className="forge-app-content"><Outlet /></div>
    </div>
  );
}
