import { ExternalLink } from "lucide-react";
import type { Trial } from "@/lib/types";

export function TrialCard({ trial }: { trial: Trial }) {
  return (
    <div className="card" style={{ padding: 28 }} data-enter>
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <span className="pill pill-sage">
          <span className="dot" />
          {trial.phase}
        </span>
        <span className="pill">{trial.location}</span>
      </div>

      <h2
        className="h-display"
        style={{ fontSize: 22, marginBottom: 12, lineHeight: 1.2 }}
      >
        {trial.name}
      </h2>

      <p
        className="lede"
        style={{ marginBottom: 16, maxWidth: "none", fontSize: 15 }}
      >
        {trial.summary}
      </p>

      <div
        style={{
          padding: "14px 16px",
          background: "var(--surface-2)",
          borderRadius: "var(--r-md)",
          marginBottom: 20,
        }}
      >
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Eligibility
        </div>
        <p style={{ margin: 0, color: "var(--ink-2)", lineHeight: 1.5, fontSize: 14 }}>
          {trial.eligibility}
        </p>
      </div>

      <a
        href={trial.url}
        target="_blank"
        rel="noopener noreferrer"
        className="btn btn-ghost btn-sm"
      >
        View on ClinicalTrials.gov
        <ExternalLink size={12} strokeWidth={1.8} />
      </a>
    </div>
  );
}
