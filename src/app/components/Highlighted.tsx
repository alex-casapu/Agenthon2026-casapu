import type { ReactNode } from "react";

/** Text with ranges (Unicode code-point offsets, end exclusive) marked. */
export function Highlighted({ text, ranges }: { text: string; ranges: { start: number; end: number }[] }) {
  const chars = Array.from(text);
  const out: ReactNode[] = [];
  let pos = 0;
  [...ranges].sort((a, b) => a.start - b.start).forEach((r, i) => {
    out.push(chars.slice(pos, r.start).join(""));
    out.push(<mark key={i}>{chars.slice(r.start, r.end).join("")}</mark>);
    pos = r.end;
  });
  out.push(chars.slice(pos).join(""));
  return <>{out}</>;
}
