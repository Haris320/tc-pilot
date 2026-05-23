"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { TrialFinder } from "@/components/TrialFinder";
import { TrialCard } from "@/components/TrialCard";
import { MOCK_TRIALS } from "@/lib/mocks";
import { api, ApiError } from "@/lib/api";
import type { PathologyReport, Profile, Trial } from "@/lib/types";

export default function TrialsPage() {
  const [pending, setPending] = useState(false);
  const [trials, setTrials] = useState<Trial[] | null>(null);

  // Load real profile + latest pathology report to pre-fill the form.
  const [profile, setProfile] = useState<Profile | null>(null);
  const [latestReport, setLatestReport] = useState<PathologyReport | null>(null);

  useEffect(() => {
    api<Profile>("/profile").then(setProfile).catch(console.error);

    api<PathologyReport>("/pathology-reports/latest")
      .then(setLatestReport)
      .catch(() => {
        // 404 is normal for new users — ignore.
      });
  }, []);

  const onSearch = async (req: {
    cancerType: string;
    location: string;
    requirements: string;
  }) => {
    setPending(true);
    setTrials(null);
    try {
      // Pass pathology context so Claude can match trials to the patient's report.
      const body = {
        ...req,
        stage: profile?.stage,
        pathologyContext: latestReport?.explanation ?? null,
      };

      // TODO(backend): wire up the real /find-trials endpoint.
      // const data = await api<{ trials: Trial[] }>("/find-trials", { body });
      // setTrials(data.trials);
      void body;
      await new Promise((r) => setTimeout(r, 1100));
      setTrials(MOCK_TRIALS);
      toast.success(`Found ${MOCK_TRIALS.length} trials.`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Search failed. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="container">
      <section className="hero">
        <div className="eyebrow">Trials</div>
        <h1 className="h-display">Trials that may fit.</h1>
        <p className="lede">
          Live search of ClinicalTrials.gov, filtered to what&apos;s open near
          you and summarised in plain English.
        </p>
        {latestReport && (
          <div className="pill pill-sage" style={{ marginTop: 12, width: "fit-content" }}>
            <span className="dot" style={{ background: "var(--sage)" }} />
            Pathology report from{" "}
            {new Date(latestReport.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}{" "}
            will be used to match trials.
          </div>
        )}
      </section>

      <section style={{ paddingBottom: 80, display: "grid", gap: 24 }}>
        <TrialFinder
          defaultCancerType={profile?.cancer_type ?? "Testicular Cancer"}
          defaultLocation={profile?.location ?? ""}
          onSearch={onSearch}
          pending={pending}
        />

        {trials !== null && trials.length === 0 && (
          <div className="card" style={{ padding: 32 }}>
            <p className="lede">
              No matches in your area — try widening the requirements or
              checking a nearby city.
            </p>
          </div>
        )}

        {trials !== null && trials.length > 0 && (
          <div style={{ display: "grid", gap: 16 }}>
            {trials.map((t) => (
              <TrialCard key={t.url} trial={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
