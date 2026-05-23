"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Printer, Sparkles } from "lucide-react";
import { QuestionList } from "@/components/QuestionList";
import { AddQuestionInput } from "@/components/AddQuestionInput";
import { PrepSheet } from "@/components/PrepSheet";
import { MOCK_QUESTIONS } from "@/lib/mocks";
import { newPatientId } from "@/lib/patient";
import type { DoctorQuestion } from "@/lib/types";

type Theme = { heading: string; questions: string[] };

export default function QuestionsPage() {
  const [items, setItems] = useState<DoctorQuestion[]>(MOCK_QUESTIONS);
  const [sheet, setSheet] = useState<Theme[] | null>(null);
  const [summarising, setSummarising] = useState(false);

  const onAdd = (text: string) => {
    const item: DoctorQuestion = {
      id: newPatientId(),
      source: "self",
      text,
      added_at: new Date().toISOString(),
      done: false,
    };
    setItems((prev) => [item, ...prev]);
    toast.success("Added to your prep sheet.");
    // TODO(backend): POST /doctor-questions { source: "self", text }
  };

  const onToggleDone = (id: string) =>
    setItems((prev) =>
      prev.map((q) => (q.id === id ? { ...q, done: !q.done } : q)),
    );

  const onSummarise = async () => {
    setSummarising(true);
    setSheet(null);
    // TODO(backend): const sheet = await api<{ themes: Theme[] }>("/doctor-questions/summarise");
    await new Promise((r) => setTimeout(r, 900));
    setSheet(MOCK_PREP_SHEET);
    setSummarising(false);
    toast.success("One prep sheet, ready to print.");
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
          <QuestionList items={items} onToggleDone={onToggleDone} />
        </div>
        {sheet && <PrepSheet themes={sheet} />}
      </section>
    </div>
  );
}

const MOCK_PREP_SHEET: Theme[] = [
  {
    heading: "Treatment plan & options",
    questions: [
      "Given the stage pT1 and clear margins, what are my options — surveillance, single-dose carboplatin, or radiation?",
      "How will we decide between those, and what would change your recommendation?",
    ],
  },
  {
    heading: "Side effects we're seeing",
    questions: [
      "Neuropathy has increased by 3 points over the past two weeks — could we discuss a dose adjustment or referral?",
      "Tinnitus has risen from 1 to 4 — would an audiology baseline make sense now?",
    ],
  },
  {
    heading: "Lifestyle and follow-up",
    questions: [
      "Is it safe to keep jogging twice a week during this cycle?",
      "How often will I need scans and blood work over the next two years?",
      "What signs of recurrence should I watch for at home?",
      "Should I bank sperm before any further treatment?",
    ],
  },
];
