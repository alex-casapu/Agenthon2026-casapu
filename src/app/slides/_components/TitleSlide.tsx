"use client";

import { Avatar } from "./ui";

const PIECES = [
  { role: "finance" as const, who: "Finance", fact: "The framework contract fixes 412 €/t for 60% of our needs, until March." },
  { role: "production" as const, who: "Production", fact: "Parma has 9 days of semolina in stock." },
  { role: "procurement" as const, who: "Procurement", fact: "Another mill's offer for 3,000 t expires in a week." },
];

export default function TitleSlide() {
  return (
    <div className="sl-hero">
      <div>
        <div className="sl-eyebrow">Company Brain</div>
        <h1>The colleague who knows,<br />and speaks first.</h1>
        <p className="sl-tagline">A shared memory your team curates, with every fact tied to its source.</p>
      </div>
      <div className="sl-pieces">
        {PIECES.map((p) => (
          <div key={p.who} className="sl-piece">
            <div className="who"><Avatar role={p.role} size={26} /> {p.who}</div>
            <div className="fact">{p.fact}</div>
          </div>
        ))}
      </div>
      <div className="sl-question">Three people. Three pieces. Who puts them together?</div>
    </div>
  );
}
