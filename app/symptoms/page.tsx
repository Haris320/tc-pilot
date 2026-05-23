"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// Static demo dataset for the toggle below the chart. Lives entirely client-side
// — never written to the DB. Trends loosely mirror a BEP cycle: fatigue + neuropathy
// climb, nausea spikes then recovers, pain stays low.
const DEMO_SYMPTOMS: Symptom[] = [
  { symptom_name: "fatigue", display_name: "Fatigue", is_default: true },
  { symptom_name: "nausea", display_name: "Nausea", is_default: true },
  { symptom_name: "neuropathy", display_name: "Neuropathy", is_default: true },
  { symptom_name: "pain", display_name: "Pain", is_default: true },
];

const DEMO_SCORES: Record<string, number[]> = {
  fatigue:    [3, 4, 4, 5, 5, 6, 6, 6, 7, 7, 7, 8, 8, 8],
  nausea:     [2, 3, 5, 6, 7, 6, 4, 3, 2, 4, 6, 7, 5, 3],
  neuropathy: [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5],
  pain:       [4, 4, 3, 3, 3, 4, 4, 3, 3, 3, 2, 2, 2, 3],
};

function buildDemoRows(): ChartRow[] {
  const today = new Date();
  const rows: ChartRow[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const day = d.toISOString().slice(0, 10);
    const idx = 13 - i;
    const row: ChartRow = { day };
    for (const s of DEMO_SYMPTOMS) row[s.symptom_name] = DEMO_SCORES[s.symptom_name][idx];
    rows.push(row);
  }
  return rows;
}

export default function SymptomsPage() {
  const router = useRouter();
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
  const [chart, setChart] = useState<ChartRow[]>([]);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  // Independent loading flags so each section renders as soon as its data arrives.
  const [symptomsLoading, setSymptomsLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  // Demo toggle — purely client-side, never touches the DB.
  const [demoMode, setDemoMode] = useState(false);
  const demoRows = useMemo(buildDemoRows, []);

  // Monotonic token for the summary request. Only the latest in-flight call
  // is allowed to touch summary / summaryLoading state — earlier responses
  // (Claude can take 5-10s) are dropped on the floor. Prevents a stale fetch
  // from clobbering the new one after Save.
  const summaryReqId = useRef(0);

  const loadSymptoms = useCallback(async () => {
    const res = await api<{ symptoms: Symptom[] }>("/symptoms");
    setSymptoms(res.symptoms);
  }, []);

  const loadChart = useCallback(async () => {
    const res = await api<{ rows: ChartRow[] }>("/symptoms/chart");
    setChart(res.rows);
  }, []);

  const loadSummary = useCallback(async () => {
    const myId = ++summaryReqId.current;
    setSummaryLoading(true);
    try {
      const res = await api<SummaryResponse>("/symptom-summary");
      if (myId === summaryReqId.current) setSummary(res);
    } catch (err) {
      if (myId === summaryReqId.current) {
        console.error(err);
        if (err instanceof ApiError) toast.error(err.message);
      }
    } finally {
      if (myId === summaryReqId.current) setSummaryLoading(false);
    }
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
    loadSummary();
  }, [loadSymptoms, loadChart, loadSummary, router]);

  const onSubmit = async (scores: SymptomScore[]) => {
    try {
      await api("/symptom-log", { body: { scores } });
      const total = scores.reduce((a, s) => a + s.score, 0);
      toast.success(`Saved ${scores.length} scores (total ${total}).`);
      // Chart refreshes immediately; summary re-runs Claude in the background.
      // loadSummary() handles its own loading flag + race protection.
      loadChart().catch(console.error);
      loadSummary();
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
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              className={`btn btn-sm ${demoMode ? "btn-sage" : "btn-ghost"}`}
              onClick={() => setDemoMode((v) => !v)}
              aria-pressed={demoMode}
              title="Swap the chart with a static demo dataset. Nothing is saved."
            >
              {demoMode ? "Showing demo data" : "Show demo data"}
            </button>
          </div>
          <SymptomChart
            rows={demoMode ? demoRows : chart}
            symptoms={demoMode ? DEMO_SYMPTOMS : symptoms}
          />
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
