import localFont from "next/font/local";
import type { ReactNode } from "react";
import Shell from "./_components/Shell";
import "./slides.css";
import "./story.css";

const plexSans = localFont({
  variable: "--sl-sans",
  display: "swap",
  src: [
    { path: "./fonts/ibm-plex-sans-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/ibm-plex-sans-latin-500-normal.woff2", weight: "500" },
    { path: "./fonts/ibm-plex-sans-latin-700-normal.woff2", weight: "700" },
  ],
});
const plexMono = localFont({
  variable: "--sl-mono",
  display: "swap",
  src: [
    { path: "./fonts/ibm-plex-mono-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500" },
    { path: "./fonts/ibm-plex-mono-latin-700-normal.woff2", weight: "700" },
  ],
});

export default function SlidesLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${plexSans.variable} ${plexMono.variable}`} style={{ display: "contents" }}>
      <Shell>{children}</Shell>
    </div>
  );
}
