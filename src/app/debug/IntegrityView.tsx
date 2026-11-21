"use client";

import { useEffect, useState } from "react";

type Report = { ok: boolean; entries: number; problems: string[]; coverage: { tbl: string; rows: number; logged: number }[] };

export default function IntegrityView() {
  const [rep, setRep] = useState<Report | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    fetch("/api/debug/verify").then((r) => r.json()).then((d) => { if (live) setRep(d); });
    return () => { live = false; };
  }, [tick]);

  if (!rep) return <p className="muted">Verifying…</p>;
  return (
    <div>
      <div className="row">
        <h2 style={{ margin: 0 }} className={rep.ok ? "ok-text" : "bad-text"}>{rep.ok ? "✓ Everything verifies" : `✗ ${rep.problems.length} problem(s)`}</h2>
        <span className="muted small">{rep.entries} chain entries · re-walks the chain, re-derives every row hash, re-slices every quote, re-runs the gate on every claim</span>
        <button onClick={() => { setRep(null); setTick((t) => t + 1); }}>Re-verify</button>
      </div>
      {rep.problems.length > 0 && <pre className="errors">{rep.problems.join("\n")}</pre>}
      <table className="int-table">
        <thead><tr><th>table</th><th>rows</th><th>log entries</th><th></th></tr></thead>
        <tbody>
          {rep.coverage.map((c) => (
            <tr key={c.tbl}>
              <td>{c.tbl}</td><td>{c.rows}</td><td>{c.logged}</td>
              <td className={c.rows === c.logged ? "ok-text" : "bad-text"}>{c.rows === c.logged ? "✓" : "✗ mismatch"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
