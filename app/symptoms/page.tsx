"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SymptomForm } from "@/components/SymptomForm";
import { SymptomChart } from "@/components/SymptomChart";
import { SymptomSummary } from "@/components/SymptomSummary";
import { AddSymptomInput } from "@/components/AddSymptomInput";
import { api, ApiError } from "@/lib/api";
import { getPatientId } from "@/lib/patient";
import type {
  ChartRow,
  SummaryResponse,
  Symptom,
  SymptomScore,
} from "@/lib/types";

export default function SymptomsPage() {
  const router = useRouter();
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [chart, setChart] = useState<ChartRow[]>([]);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  // Independent loading flags so each section renders as soon as its data arrives.
  const [symptomsLoading, setSymptomsLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const loadSymptoms = useCallback(async () => {
    const res = await api<{ symptoms: Symptom[] }>("/symptoms");
    setSymptoms(res.symptoms);
  }, []);

  const loadChart = useCallback(async () => {
    const res = await api<{ rows: ChartRow[] }>("/symptoms/chart");
    setChart(res.rows);
  }, []);

  const loadSummary = useCallback(async () => {
    const res = await api<SummaryResponse>("/symptom-summary");
    setSummary(res);
  }, []);

  useEffect(() => {
    if (!getPatientId()) {
      router.replace("/onboarding");
      return;
    }

    // Symptoms + chart unblock the form immediately.
    Promise.all([loadSymptoms(), loadChart()])
      .catch((err) => {
        console.error(err);
        if (err instanceof ApiError) toast.error(err.message);
      })
      .finally(() => setSymptomsLoading(false));

    // Summary calls Claude — runs in parallel but doesn't block the form.
    loadSummary()
      .catch((err) => {
        console.error(err);
        if (err instanceof ApiError) toast.error(err.message);
      })
      .finally(() => setSummaryLoading(false));
  }, [loadSymptoms, loadChart, loadSummary, router]);

  const onSubmit = async (scores: SymptomScore[]) => {
    try {
      await api("/symptom-log", { body: { scores } });
      const total = scores.reduce((a, s) => a + s.score, 0);
      toast.success(`Saved ${scores.length} scores (total ${total}).`);
      // Chart refreshes immediately; summary re-runs Claude in the background.
      setSummaryLoading(true);
      loadChart().catch(console.error);
      loadSummary()
        .catch((err) => {
          if (err instanceof ApiError) toast.error(err.message);
        })
        .finally(() => setSummaryLoading(false));
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Couldn't save your log.";
      toast.error(msg);
    }
  };

  const onAdd = (sym: Symptom) => {
    // The /symptom-validate endpoint already persisted it; reflect locally.
    setSymptoms((prev) =>
      prev.some((s) => s.symptom_name === sym.symptom_name) ? prev : [...prev, sym],
    );
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
          {symptomsLoading ? (
            <div className="card" style={{ padding: 32, color: "var(--muted)" }}>
              Loading your trackers…
            </div>
          ) : (
            <>
              <SymptomForm symptoms={symptoms} onSubmit={onSubmit} />
              <AddSymptomInput onAdd={onAdd} />
            </>
          )}
        </div>
        <div style={{ display: "grid", gap: 24 }}>
          <SymptomChart rows={chart} symptoms={symptoms} />
          {summaryLoading ? (
            <div className="card" style={{ padding: 24, color: "var(--muted)" }}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>Weekly read</div>
              Analysing your trends…
            </div>
          ) : (
            summary && <SymptomSummary data={summary} />
          )}
        </div>
      </section>
    </div>
  );
}
