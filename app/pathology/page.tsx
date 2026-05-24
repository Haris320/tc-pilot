"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ReportInput } from "@/components/ReportInput";
import { ReportOutput } from "@/components/ReportOutput";
import { api, ApiError } from "@/lib/api";
import type {
  FindTrialsLatestResponse,
  PathologyReport,
  TranslateResponse,
} from "@/lib/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function PathologyPage() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<TranslateResponse | null>(null);
  const [history, setHistory] = useState<PathologyReport[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [trialSearch, setTrialSearch] = useState<FindTrialsLatestResponse | null>(
    null,
  );

  const fetchLatestTrials = useCallback(async () => {
    try {
      const latest = await api<FindTrialsLatestResponse>("/find-trials/latest");
      setTrialSearch(latest);
      return latest;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    api<{ reports: PathologyReport[] }>("/pathology-reports")
      .then((d) => setHistory(d.reports))
      .catch((err) => console.error("history load:", err))
      .finally(() => setHistoryLoading(false));
    fetchLatestTrials();
  }, [fetchLatestTrials]);

  const onTranslate = async (reportText: string) => {
    setPending(true);
    setResult(null);
    setActiveId(null);
    setTrialSearch(null);
    try {
      const data = await api<TranslateResponse>("/translate-report", {
        body: { reportText },
      });
      setResult(data);

      api<{ reports: PathologyReport[] }>("/pathology-reports")
        .then((d) => {
          setHistory(d.reports);
          if (d.reports[0]) setActiveId(d.reports[0].id);
        })
        .catch(console.error);

      if (data.questions.length > 0) {
        api("/doctor-questions", {
          body: { source: "report", items: data.questions },
        }).catch(console.error);
      }

      if (data.trial_search_status === "completed") {
        const latest = await fetchLatestTrials();
        const count = latest?.trials?.length ?? 0;
        toast.success(
          count > 0
            ? `Translation ready. ${count} trial${count === 1 ? "" : "s"} matched.`
            : "Translation ready. No matching trials right now.",
        );
      } else if (data.trial_search_status === "failed") {
        toast.warning(
          "Translation ready. Trial search failed — see Trials page.",
        );
      } else {
        toast.success("Translation ready. Questions added to your prep sheet.");
      }
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
        <div style={{ display: "grid", gap: 16 }}>
          <ReportInput onSubmit={onTranslate} pending={pending} />

          {pending && (
            <div className="card" style={{ padding: 20 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                Working
              </div>
              <p style={{ margin: 0, fontSize: 14, color: "var(--ink-2)" }}>
                Translating your report and searching ClinicalTrials.gov for
                matching trials. This takes 30–60 seconds.
              </p>
            </div>
          )}

          {!pending && trialSearch?.status === "completed" && (
            <div className="card" style={{ padding: 20 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                Trial search complete
              </div>
              <p style={{ margin: 0, fontSize: 14, color: "var(--ink-2)" }}>
                {trialSearch.trials?.length ?? 0} trials ranked on your Trials page.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ marginTop: 12 }}
                onClick={() => router.push("/trials")}
              >
                View trials
              </button>
            </div>
          )}

          {!pending && trialSearch?.status === "failed" && (
            <div className="card" style={{ padding: 20 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                Trial search failed
              </div>
              <p style={{ margin: 0, fontSize: 14, color: "var(--ink-2)" }}>
                {trialSearch.note ?? "Try uploading your report again."}
              </p>
            </div>
          )}

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
                    className={
                      activeId === r.id ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"
                    }
                    style={{ justifyContent: "flex-start", textAlign: "left" }}
                  >
                    <span style={{ flex: 1 }}>{formatDate(r.created_at)}</span>
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

        {result && <ReportOutput data={result} />}
      </section>
    </div>
  );
}
