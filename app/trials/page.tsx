"use client";

import { useCallback, useEffect, useState } from "react";
import { AgentTrialCard } from "@/components/AgentTrialCard";
import { api } from "@/lib/api";
import type { FindTrialsLatestResponse, PathologyReport, Profile } from "@/lib/types";

export default function TrialsPage() {
  const [data, setData] = useState<FindTrialsLatestResponse | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [latestReport, setLatestReport] = useState<PathologyReport | null>(null);

  const loadLatest = useCallback(async () => {
    try {
      const latest = await api<FindTrialsLatestResponse>("/find-trials/latest");
      setData(latest);
      return latest;
    } catch (err) {
      console.error("find-trials/latest:", err);
      return null;
    }
  }, []);

  useEffect(() => {
    api<Profile>("/profile").then(setProfile).catch(console.error);
    api<PathologyReport>("/pathology-reports/latest")
      .then(setLatestReport)
      .catch(() => {});
    loadLatest();
  }, [loadLatest]);

  useEffect(() => {
    if (!data || data.status !== "pending") return;
    const id = window.setInterval(() => {
      loadLatest();
    }, 4000);
    return () => window.clearInterval(id);
  }, [data?.status, loadLatest]);

  const status = data?.status ?? "pending";
  const trials = data?.trials ?? [];

  return (
    <div className="container">
      <section className="hero">
        <div className="eyebrow">Trials</div>
        <h1 className="h-display">Trials that may fit.</h1>
        <p className="lede">
          After you upload a pathology report, we search ClinicalTrials.gov and
          rank options for your situation — no manual search needed.
        </p>
        {latestReport && (
          <div className="pill pill-sage" style={{ marginTop: 12, width: "fit-content" }}>
            <span className="dot" style={{ background: "var(--sage)" }} />
            Pathology from{" "}
            {new Date(latestReport.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </div>
        )}
      </section>

      <section style={{ paddingBottom: 80, display: "grid", gap: 24 }}>
        {status === "pending" && (
          <div className="card" style={{ padding: 28 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Agent working
            </div>
            <p className="lede" style={{ margin: 0 }}>
              Planning your search, querying trials, and matching eligibility…
              This usually takes 30–90 seconds.
            </p>
          </div>
        )}

        {status === "failed" && (
          <div className="card" style={{ padding: 28 }}>
            <p className="lede" style={{ margin: 0 }}>
              {data?.note ?? "Trial search failed. Try uploading your pathology report again."}
            </p>
          </div>
        )}

        {status === "completed" && (data?.planning_rationale || data?.search_query_used) && (
          <div className="card" style={{ padding: 24 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              How we searched
            </div>
            {data?.planning_rationale && (
              <p style={{ margin: 0, lineHeight: 1.55 }}>{data.planning_rationale}</p>
            )}
            {data?.search_query_used && (
              <div
                style={{
                  marginTop: 12,
                  fontSize: 13,
                  color: "var(--ink-2)",
                  fontFamily: "var(--font-mono, monospace)",
                  display: "grid",
                  gap: 4,
                }}
              >
                <div>
                  <strong>cancer_type:</strong> {data.search_query_used.cancer_type}
                </div>
                <div>
                  <strong>location:</strong> {data.search_query_used.location}
                </div>
                <div>
                  <strong>page_size:</strong> {data.search_query_used.page_size}
                </div>
                {data.search_query_used.must_match_terms?.length > 0 && (
                  <div>
                    <strong>must_match_terms:</strong>{" "}
                    {data.search_query_used.must_match_terms.join(", ")}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {status === "completed" && data?.appointment_summary && (
          <div className="card" style={{ padding: 24 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Appointment prep
            </div>
            <p style={{ margin: 0, lineHeight: 1.55 }}>{data.appointment_summary}</p>
            {data.questions_to_ask_oncologist &&
              data.questions_to_ask_oncologist.length > 0 && (
                <ul style={{ marginTop: 12, marginBottom: 0, paddingLeft: 18 }}>
                  {data.questions_to_ask_oncologist.map((q) => (
                    <li key={q} style={{ marginBottom: 6 }}>
                      {q}
                    </li>
                  ))}
                </ul>
              )}
          </div>
        )}

        {status === "completed" && trials.length === 0 && (
          <div className="card" style={{ padding: 32 }}>
            <p className="lede" style={{ margin: 0 }}>
              No matching trials right now. Discuss options with your oncologist.
            </p>
          </div>
        )}

        {status === "completed" && trials.length > 0 && (
          <div style={{ display: "grid", gap: 16 }}>
            {trials.map((t) => (
              <AgentTrialCard key={t.url || t.name} trial={t} />
            ))}
          </div>
        )}

        {!latestReport && !profile && status === "pending" && (
          <div className="card" style={{ padding: 24 }}>
            <p className="lede" style={{ margin: 0 }}>
              Complete onboarding and paste a pathology report to start a trial search.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
