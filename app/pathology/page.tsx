"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ReportInput } from "@/components/ReportInput";
import { ReportOutput } from "@/components/ReportOutput";
import { MOCK_TRANSLATION } from "@/lib/mocks";
import type { TranslateResponse } from "@/lib/types";

export default function PathologyPage() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<TranslateResponse | null>(null);

  const onTranslate = async (reportText: string) => {
    setPending(true);
    setResult(null);
    try {
      // TODO(backend): const data = await api<TranslateResponse>("/translate-report", { body: { reportText } });
      await new Promise((r) => setTimeout(r, 900));
      setResult(MOCK_TRANSLATION);

      // After a successful translation, push each question into the doctor-questions list.
      // TODO(backend): await api("/doctor-questions", { body: { source: "report", items: MOCK_TRANSLATION.questions } });
      toast.success("Translation ready. Questions added to your prep sheet.");
      // Hint at length so the demo never feels empty.
      void reportText;
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="container">
      <section className="hero">
        <div className="eyebrow">Pathology</div>
        <h1 className="h-display">Paste your report.</h1>
        <p className="lede">
          I&apos;ll explain it in plain English and write down the questions
          worth asking next time.
        </p>
      </section>

      <section
        style={{
          paddingBottom: 80,
          display: "grid",
          gap: 24,
          gridTemplateColumns: result
            ? "minmax(0, 1fr) minmax(0, 1.2fr)"
            : "minmax(0, 1fr)",
          alignItems: "start",
        }}
      >
        <ReportInput onSubmit={onTranslate} pending={pending} />
        {result && <ReportOutput data={result} />}
      </section>
    </div>
  );
}
