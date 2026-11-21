import type { ReactNode } from "react";

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

const svg = (children: ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);

/** Add a page = add an entry here. Icons are inline SVG (Lucide-style paths). */
export const NAV: NavItem[] = [
  {
    href: "/debug",
    label: "Debug · god mode",
    icon: svg(
      <>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
        <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
      </>,
    ),
  },
  {
    href: "/claims",
    label: "Claims · human-friendly debug",
    icon: svg(
      <>
        <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2H4c-1.25 0-2 .76-2 2v6c0 1.25.76 2 2 2h4" />
        <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.76-2-2-2h-4c-1.25 0-2 .76-2 2v6c0 1.25.76 2 2 2h4" />
      </>,
    ),
  },
];
