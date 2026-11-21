"use client";

import { useState } from "react";
import Workbench from "../Workbench";
import InboxView from "./InboxView";
import IntegrityView from "./IntegrityView";
import SqlView from "./SqlView";
import TablesView from "./TablesView";

const TABS = [
  { id: "tables", label: "Tables" },
  { id: "inbox", label: "Inbox" },
  { id: "sql", label: "SQL" },
  { id: "integrity", label: "Integrity" },
  { id: "workbench", label: "Workbench" },
] as const;

export default function DebugShell() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("tables");
  return (
    <div className="debug">
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "tables" && <TablesView />}
      {tab === "inbox" && <InboxView />}
      {tab === "sql" && <SqlView />}
      {tab === "integrity" && <IntegrityView />}
      {tab === "workbench" && <Workbench />}
    </div>
  );
}
