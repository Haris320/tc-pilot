"use client";

import { useState } from "react";
import type { Symptom, SymptomScore } from "@/lib/types";

type Props = {
  symptoms: Symptom[];
  onSubmit: (scores: SymptomScore[]) => Promise<void> | void;
};

export function SymptomForm({ symptoms, onSubmit }: Props) {
  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(symptoms.map((s) => [s.symptom_name, 3])),
  );
  const [submitting, setSubmitting] = useState(false);

  const set = (name: string, v: number) =>
    setScores((prev) => ({ ...prev, [name]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const payload: SymptomScore[] = symptoms.map((s) => ({
      symptom_name: s.symptom_name,
      score: scores[s.symptom_name] ?? 1,
    }));
    try {
      await onSubmit(payload);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="card" style={{ padding: 32 }} data-enter>
      {symptoms.map((s) => (
        <div key={s.symptom_name} className="tc-slider-row">
          <div className="tc-slider-head">
            <span className="tc-slider-label">{s.display_name}</span>
            <span className="tc-slider-val">{scores[s.symptom_name]} / 10</span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={scores[s.symptom_name] ?? 1}
            onChange={(e) => set(s.symptom_name, Number(e.target.value))}
            className="tc-slider"
            aria-label={s.display_name}
          />
          <div className="tc-slider-scale">
            <span>none</span>
            <span>moderate</span>
            <span>severe</span>
          </div>
        </div>
      ))}

      <div
        style={{
          marginTop: 24,
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting}
        >
          {submitting ? "Saving…" : "Save today’s log"}
        </button>
      </div>
    </form>
  );
}
