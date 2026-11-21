"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "./nav";

export default function TopBar() {
  const path = usePathname();
  return (
    <nav className="topbar" aria-label="Views">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} title={n.label} aria-label={n.label} className={path.startsWith(n.href) ? "active" : ""}>
          {n.icon}
        </Link>
      ))}
    </nav>
  );
}
