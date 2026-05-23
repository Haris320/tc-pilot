"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { BrandMark } from "./BrandMark";
import { ThemeToggle } from "./ThemeToggle";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/symptoms", label: "Symptoms" },
  { href: "/pathology", label: "Pathology" },
  { href: "/questions", label: "Questions" },
  { href: "/trials", label: "Trials" },
  { href: "/analytics", label: "Analytics" },
];

export function TopBar() {
  const pathname = usePathname();
  return (
    <header className="topbar">
      <div className="topbar-left">
        <Link href="/" style={{ textDecoration: "none" }}>
          <BrandMark />
        </Link>
        <nav className="nav">
          {NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={clsx(active && "active")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <ThemeToggle />
      </div>
    </header>
  );
}
