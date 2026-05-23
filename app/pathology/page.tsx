"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ReportInput } from "@/components/ReportInput";
import { ReportOutput } from "@/components/ReportOutput";
import { api, ApiError } from "@/lib/api";
import type { PathologyReport, TranslateResponse } from "@/lib/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PathologyPage() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<TranslateResponse | null>(null);
  const [history, setHistory] = useState<PathologyReport[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Load past reports on mount.
  useEffect(() => {
    api<{ reports: PathologyReport[] }>("/pathology-reports")
      .then((d) => setHistory(d.reports))
      .catch((err) => console.error("history load:", err))
      .finally(() => setHistoryLoading(false));
  }, []);

  const onTranslate = async (reportText: string) => {
    setPending(true);
    setResult(null);
    setActiveId(null);
    try {
      const data = await api<TranslateResponse>("/translate-report", {
        body: { reportText },
      });
      setResult(data);

      // Refresh history so the new report shows up immediately.
      api<{ reports: PathologyReport[] }>("/pathology-reports")
        .then((d) => {
          setHistory(d.reports);
          if (d.reports[0]) setActiveId(d.reports[0].id);
        })
        .catch(console.error);

      // Fan out auto-generated questions into the prep sheet.
      if (data.questions.length > 0) {
        api("/doctor-questions", {
          body: { source: "report", items: data.questions },
        }).catch(console.error);
      }

      toast.success("Translation ready. Questions added to your prep sheet.");
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again.",
      );
    } finally {
      setPending(false);
    }
  };

  const restoreReport = (report: PathologyReport) => {
    setResult({ explanation: report.explanation, questions: report.questions });
    setActiveId(report.id);
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
        {/* Left column: input + history */}
        <div style={{ display: "grid", gap: 16 }}>
          <ReportInput onSubmit={onTranslate} pending={pending} />

          {/* Past reports */}
          {!historyLoading && history.length > 0 && (
            <div className="card" style={{ padding: 20 }}>
              <div className="eyebrow" style={{ marginBottom: 12 }}>
                Past reports
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {history.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => restoreReport(r)}
                    className={activeId === r.id ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
                    style={{ justifyContent: "flex-start", textAlign: "left" }}
                  >
                    <span style={{ flex: 1 }}>
                      {formatDate(r.created_at)}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        opacity: 0.6,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 160,
                      }}
                    >
                      {r.report_text.slice(0, 60).trim()}…
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: explanation */}
        {result && <ReportOutput data={result} />}
      </section>
    </div>
  );
}
