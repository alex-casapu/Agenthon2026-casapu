import type { ReactNode } from "react";

/** Each person gets a colour so who is asking is obvious at a glance. */
export const PERSONA: Record<string, { from: string; to: string; initials: string }> = {
  marta: { from: "#6366f1", to: "#a855f7", initials: "MR" },
  luca: { from: "#10b981", to: "#14b8a6", initials: "LB" },
  sara: { from: "#f59e0b", to: "#f97316", initials: "SC" },
};

export function Avatar({ id, size = 40 }: { id: string; size?: number }) {
  const p = PERSONA[id] ?? { from: "#94a3b8", to: "#64748b", initials: "?" };
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(135deg, ${p.from}, ${p.to})` }} aria-hidden>
      {p.initials}
    </span>
  );
}

const ico = (children: ReactNode, size = 18) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);

export const BrainMark = ({ size = 18 }: { size?: number }) =>
  ico(<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />, size);

export const SendIcon = () => ico(<path d="M5 12h14M13 6l6 6-6 6" />, 18);
export const PlusIcon = () => ico(<path d="M12 5v14M5 12h14" />, 16);
export const ShieldIcon = ({ size = 14 }: { size?: number }) => ico(<><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></>, size);
export const QuestionIcon = () => ico(<><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01" /></>, 22);
export const ArrowIcon = () => ico(<path d="M7 17L17 7M8 7h9v9" />, 14);

export const KindIcon = ({ kind }: { kind: string }) =>
  kind === "email"
    ? ico(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>, 14)
    : kind === "news"
      ? ico(<><path d="M4 5h13a2 2 0 0 1 2 2v12H6a2 2 0 0 1-2-2z" /><path d="M8 9h7M8 13h7" /></>, 14)
      : ico(<><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></>, 14);
