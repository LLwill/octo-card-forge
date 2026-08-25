import { Boxes, Braces, CreditCard, Download, GalleryVerticalEnd } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { cn } from "../lib/utils.js";

const navigation = [
  { to: "/", label: "能力总览", icon: GalleryVerticalEnd, end: true },
  { to: "/cards", label: "卡片案例", icon: CreditCard },
  { to: "/components", label: "组件规范", icon: Boxes },
  { to: "/install", label: "安装使用", icon: Download },
];

export function AppShell() {
  return (
    <div className="forge-app-shell">
      <header className="forge-topbar">
        <Link className="forge-brand" to="/" aria-label="Octo Card Forge 首页">
          <span className="forge-brand-mark">O</span>
          <span className="forge-brand-copy"><strong>Octo</strong><small>Card Forge</small></span>
        </Link>

        <nav className="forge-global-nav" aria-label="主导航">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn(
                "forge-global-link",
                isActive && "active",
              )}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <Link className="forge-preview-link" to="/playground"><Braces aria-hidden="true" /><span>JSON 预览</span></Link>
      </header>

      <div className="forge-app-content"><Outlet /></div>
    </div>
  );
}
