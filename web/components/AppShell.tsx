"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Boxes,
  FlaskConical,
  LayoutDashboard,
  MapPin,
  Menu,
  Route as RouteIcon,
  RotateCcw,
  Search,
  Truck,
  Waypoints,
  X,
} from "lucide-react";
import { api } from "@/lib/client";
import type { StoreData } from "@/lib/types";
import { useAppData } from "./AppData";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/locations", label: "Locations", icon: MapPin },
  { href: "/roads", label: "Road Network", icon: Waypoints },
  { href: "/deliveries", label: "Deliveries", icon: Truck },
  { href: "/route", label: "Route Results", icon: RouteIcon },
  { href: "/explorer", label: "Path Explorer", icon: Search },
  { href: "/lab", label: "Algorithm Lab", icon: FlaskConical },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const { setData, notify } = useAppData();

  async function resetDemo() {
    if (!confirm("Replace ALL locations, roads and deliveries with the demo dataset?")) return;
    setResetting(true);
    try {
      setData(await api<StoreData>("/api/reset-demo", "POST"));
      notify("success", "Demo data restored.");
    } catch (e) {
      notify("error", (e as Error).message);
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="shell">
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">
            <Boxes size={20} />
          </span>
          <div>
            <div className="brand-title">RouteForge</div>
            <div className="brand-sub">Multi-delivery planner</div>
          </div>
          <button className="icon-btn sidebar-close" onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <nav className="nav">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link key={href} href={href} className={`nav-link ${active ? "active" : ""}`} onClick={() => setOpen(false)}>
                <Icon size={18} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="engine-badge">
            <span className="dot" /> C++ engine · Dijkstra · 2-opt
          </div>
          <button className="btn btn-ghost-dark" onClick={resetDemo} disabled={resetting}>
            <RotateCcw size={16} /> {resetting ? "Restoring…" : "Reset to demo data"}
          </button>
        </div>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <span className="topbar-title">{NAV.find((n) => (n.href === "/" ? pathname === "/" : pathname.startsWith(n.href)))?.label}</span>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
