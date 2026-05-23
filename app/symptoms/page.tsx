"use client";

import { useState } from "react";
import { toast } from "sonner";
import { SymptomForm } from "@/components/SymptomForm";
import { SymptomChart } from "@/components/SymptomChart";
import { SymptomSummary } from "@/components/SymptomSummary";
import { AddSymptomInput } from "@/components/AddSymptomInput";
import { MOCK_SYMPTOMS, MOCK_CHART, MOCK_SUMMARY } from "@/lib/mocks";
import type { Symptom, SymptomScore } from "@/lib/types";

export default function SymptomsPage() {
  const [symptoms, setSymptoms] = useState<Symptom[]>(MOCK_SYMPTOMS);

  const onSubmit = async (scores: SymptomScore[]) => {
    // TODO(backend): POST /symptom-log { scores }
    await new Promise((r) => setTimeout(r, 300));
    const total = scores.reduce((a, s) => a + s.score, 0);
    toast.success(`Saved ${scores.length} scores (total ${total}).`);
  };

  const onAdd = (sym: Symptom) => {
    if (symptoms.some((s) => s.symptom_name === sym.symptom_name)) return;
    setSymptoms((prev) => [...prev, sym]);
  };

  return (
    <div className="container">
      <section className="hero">
        <div className="eyebrow">Symptoms</div>
        <h1 className="h-display">How are you feeling today?</h1>
        <p className="lede">
          Move each slider to where you are right now. One log per day is plenty.
        </p>
      </section>

      <section
        style={{
          paddingBottom: 80,
          display: "grid",
          gap: 24,
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
        }}
      >
        <div>
          <SymptomForm symptoms={symptoms} onSubmit={onSubmit} />
          <AddSymptomInput onAdd={onAdd} />
        </div>
        <div style={{ display: "grid", gap: 24 }}>
          <SymptomChart rows={MOCK_CHART} symptoms={symptoms} />
          <SymptomSummary data={MOCK_SUMMARY} />
        </div>
      </section>
    </div>
  );
}
