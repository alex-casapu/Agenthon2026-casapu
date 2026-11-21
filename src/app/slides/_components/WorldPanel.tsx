"use client";

import { useScenario } from "@/lib/scenario/store";

/** The company's systems, as they actually are. Only a human approval ever changes them. */
export default function WorldPanel() {
  const s = useScenario();
  const has = s.orders.length > 0;
  return (
    <div>
      <div className="sl-tiles">
        <div className={`sl-card sl-tile${has ? " flash" : ""}`}>
          <div className="sys">ERP · Advance purchase orders</div>
          <div className="big">{has ? s.orders.length : "None"}</div>
          <div className="sub">{has ? "Created by an approved action" : "No advance purchase of semolina"}</div>
          {s.orders.map((o) => (
            <div key={o.id} className="sl-po">
              <strong className="mono">{o.id}</strong>
              <span>{o.tonnes.toLocaleString("en-US")} t · {o.supplier} · {o.price} €/t</span>
              <span className="muted small" style={{ marginLeft: "auto" }}>{o.at}</span>
            </div>
          ))}
        </div>
        <div className="sl-card sl-tile">
          <div className="sys">WMS Parma · Stock</div>
          <div className="big">9 days</div>
          <div className="sub">Durum semolina cover, as of 20/11{has ? " · rises on delivery" : ""}</div>
        </div>
        <div className="sl-card sl-tile">
          <div className="sys">Market reference</div>
          <div className="big">425 €/t</div>
          <div className="sub">Spot, October national average</div>
        </div>
      </div>
    </div>
  );
}
