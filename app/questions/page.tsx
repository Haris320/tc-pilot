"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Printer, Sparkles } from "lucide-react";
import { QuestionList } from "@/components/QuestionList";
import { AddQuestionInput } from "@/components/AddQuestionInput";
import { PrepSheet } from "@/components/PrepSheet";
import { api, ApiError } from "@/lib/api";
import type { DoctorQuestion } from "@/lib/types";

type Theme = { heading: string; questions: string[] };

export default function QuestionsPage() {
  const [items, setItems] = useState<DoctorQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<Theme[] | null>(null);
  const [summarising, setSummarising] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ items: DoctorQuestion[] }>("/doctor-questions");
    setItems(res.items);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch (err) {
        if (err instanceof ApiError) toast.error(err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [load]);

  const onAdd = async (text: string) => {
    try {
      await api("/doctor-questions", { body: { source: "self", text } });
      toast.success("Added to your prep sheet.");
      await load();
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Couldn't add that question.";
      toast.error(msg);
    }
  };

  const onToggleDone = async (id: string) => {
    // Optimistic flip then re-fetch.
    setItems((prev) => prev.map((q) => (q.id === id ? { ...q, done: !q.done } : q)));
    try {
      await api(`/doctor-questions/${id}/done`, { method: "POST" });
    } catch (err) {
      console.error(err);
      // Roll back on failure.
      setItems((prev) => prev.map((q) => (q.id === id ? { ...q, done: !q.done } : q)));
      const msg = err instanceof ApiError ? err.message : "Couldn't update that question.";
      toast.error(msg);
    }
  };

  const onSummarise = async () => {
    setSummarising(true);
    setSheet(null);
    try {
      const res = await api<{ themes: Theme[] }>("/doctor-questions/summarise", {
        method: "POST",
      });
      setSheet(res.themes);
      toast.success("One prep sheet, ready to print.");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Couldn't summarise.";
      toast.error(msg);
    } finally {
      setSummarising(false);
    }
  };

  const active = useMemo(() => items.filter((q) => !q.done), [items]);

  return (
    <div className="container">
      <section className="hero no-print">
        <div className="eyebrow">Appointment prep</div>
        <h1 className="h-display">Questions for your next visit.</h1>
        <p className="lede">
          Pulled together from your reports, symptom trends, and notes. Print
          the prep sheet and bring it to the appointment.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 24, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onSummarise}
            disabled={summarising || active.length === 0}
          >
            <Sparkles size={14} strokeWidth={1.8} />
            {summarising ? "Summarising…" : "Summarise into one prep sheet"}
          </button>
          {sheet && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => window.print()}
            >
              <Printer size={14} strokeWidth={1.8} />
              Print
            </button>
          )}
        </div>
      </section>

      <section
        style={{
          paddingBottom: 80,
          display: "grid",
          gap: 24,
          gridTemplateColumns: sheet
            ? "minmax(0, 1fr) minmax(0, 1.1fr)"
            : "minmax(0, 1fr)",
          alignItems: "start",
        }}
      >
        <div style={{ display: "grid", gap: 16 }}>
          <AddQuestionInput onAdd={onAdd} />
          {loading ? (
            <div className="card" style={{ padding: 24, color: "var(--muted)" }}>
              Loading your questions…
            </div>
          ) : (
            <QuestionList items={items} onToggleDone={onToggleDone} />
          )}
        </div>
        {sheet && <PrepSheet themes={sheet} />}
      </section>
    </div>
  );
}
