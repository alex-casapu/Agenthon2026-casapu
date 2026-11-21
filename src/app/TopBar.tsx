"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SLIDES } from "@/lib/scenario/slides";
import { NAV_LEFT, SLIDE_ICONS } from "./nav";

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
      <span className="topbar-slides" role="group" aria-label="Presentation">
        {SLIDES.map((s, i) => {
          const href = `/slides/${s.slug}`;
          return (
            <Link key={s.slug} href={href} title={`${i + 1}. ${s.title}`} aria-label={`Slide ${i + 1}: ${s.title}`} className={path === href ? "active" : ""}>
              {SLIDE_ICONS[s.slug]}
              <span className="num">{i + 1}</span>
            </Link>
          );
        })}
      </span>
    </nav>
  );
}
