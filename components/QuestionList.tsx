"use client";

import { Check } from "lucide-react";
import type { DoctorQuestion } from "@/lib/types";

const SOURCE_LABEL: Record<DoctorQuestion["source"], string> = {
  report: "From your report",
  "symptom-alert": "From your symptom trends",
  self: "Added by you",
};

const SOURCE_PILL: Record<DoctorQuestion["source"], string> = {
  report: "pill",
  "symptom-alert": "pill pill-clay",
  self: "pill pill-sage",
};

type Props = {
  items: DoctorQuestion[];
  onToggleDone: (id: string) => void;
};

export function QuestionList({ items, onToggleDone }: Props) {
  if (items.length === 0) {
    return (
      <div className="card" style={{ padding: 32 }}>
        <p className="lede">
          No questions yet. Translate a report or log a few days of symptoms,
          and this page will fill itself in.
        </p>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 12 }}>
      {items.map((q) => (
        <div
          key={q.id}
          className="card"
          style={{
            padding: 20,
            display: "flex",
            alignItems: "flex-start",
            gap: 16,
            opacity: q.done ? 0.5 : 1,
          }}
          data-enter
        >
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: 10 }}>
              <span className={SOURCE_PILL[q.source]}>
                <span
                  className={`dot ${q.source === "symptom-alert" ? "warn" : q.source === "report" ? "muted" : ""}`}
                />
                {SOURCE_LABEL[q.source]}
              </span>
            </div>
            <p
              style={{
                margin: 0,
                color: "var(--ink)",
                lineHeight: 1.55,
                textDecoration: q.done ? "line-through" : "none",
              }}
            >
              {q.text}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onToggleDone(q.id)}
            className="btn btn-ghost btn-sm no-print"
            aria-label={q.done ? "Mark not done" : "Mark done"}
            style={{ flex: "0 0 auto" }}
          >
            <Check size={14} strokeWidth={1.8} />
            {q.done ? "Undo" : "Done"}
          </button>
        </div>
      ))}
    </div>
  );
}
