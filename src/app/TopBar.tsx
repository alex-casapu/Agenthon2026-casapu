"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_LEFT, SLIDE_ICONS } from "./nav";

/**
 * Every page of the app stays in the header. The slides do not get an icon each any more:
 * they are walked with the arrow keys, so one entry opens the talk (backup slides: key B).
 */
export default function TopBar() {
  const path = usePathname();
  return (
    <nav className="topbar" aria-label="Views">
      {NAV_LEFT.map((n) => (
        <Link key={n.href} href={n.href} title={n.label} aria-label={n.label} className={path.startsWith(n.href) ? "active" : ""}>
          {n.icon}
        </Link>
      ))}
      <span className="spacer" />
      <Link href="/slides/intro" title="The talk (arrow keys; B for backup slides)" aria-label="The talk" className={path.startsWith("/slides") ? "active" : ""}>
        {SLIDE_ICONS.title ?? <span aria-hidden>▶</span>}
      </Link>
    </nav>
  );
}
