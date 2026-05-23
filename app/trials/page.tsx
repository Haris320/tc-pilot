"use client";

import { useState } from "react";
import { toast } from "sonner";
import { TrialFinder } from "@/components/TrialFinder";
import { TrialCard } from "@/components/TrialCard";
import { MOCK_PROFILE, MOCK_TRIALS } from "@/lib/mocks";
import type { Trial } from "@/lib/types";

export default function TrialsPage() {
  const [pending, setPending] = useState(false);
  const [trials, setTrials] = useState<Trial[] | null>(null);

  const onSearch = async (req: {
    cancerType: string;
    location: string;
    requirements: string;
  }) => {
    setPending(true);
    setTrials(null);
    try {
      // TODO(backend): const data = await api<{ trials: Trial[] }>("/find-trials", { body: req });
      // setTrials(data.trials);
      void req;
      await new Promise((r) => setTimeout(r, 1100));
      setTrials(MOCK_TRIALS);
      toast.success(`Found ${MOCK_TRIALS.length} trials.`);
    } catch {
      toast.error("Search failed. Please try again.");
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
      </section>

      <section style={{ paddingBottom: 80, display: "grid", gap: 24 }}>
        <TrialFinder
          defaultCancerType={MOCK_PROFILE.cancer_type}
          defaultLocation={MOCK_PROFILE.location}
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
