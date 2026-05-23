"use client";

import { useState } from "react";
import { SAMPLE_REPORT } from "@/lib/mocks";

type Props = {
  onSubmit: (reportText: string) => Promise<void> | void;
  pending: boolean;
};

export function ReportInput({ onSubmit, pending }: Props) {
  const [text, setText] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSubmit(text);
  };

  return (
    <form onSubmit={submit} className="card" style={{ padding: 32 }}>
      <label className="eyebrow" style={{ display: "block", marginBottom: 10 }}>
        Pathology report
      </label>
      <textarea
        className="input"
        placeholder="Paste the full text of your pathology report here…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={14}
        disabled={pending}
      />
      <div
        style={{
          marginTop: 16,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setText(SAMPLE_REPORT)}
          disabled={pending}
        >
          Paste sample report
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={pending || !text.trim()}
        >
          {pending ? "Translating…" : "Translate report"}
        </button>
      </div>
    </form>
  );
}
