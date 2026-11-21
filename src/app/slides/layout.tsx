import type { ReactNode } from "react";
import Shell from "./_components/Shell";
import "./slides.css";

export default function SlidesLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
