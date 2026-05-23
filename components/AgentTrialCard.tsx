import { ExternalLink } from "lucide-react";
import type { AgentTrial } from "@/lib/types";

const fitLabel: Record<string, string> = {
  likely_fit: "Likely fit",
  uncertain: "Uncertain",
  unlikely_fit: "Unlikely fit",
};

export function AgentTrialCard({ trial }: { trial: AgentTrial }) {
  const fit = trial.eligibility_status
    ? fitLabel[trial.eligibility_status] ?? trial.eligibility_status
    : trial.eligibility;

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
        {trial.match_score != null && (
          <span className="pill">Match {trial.match_score}/10</span>
        )}
        {fit && <span className="pill">{fit}</span>}
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

      {trial.questions_to_ask_oncologist &&
        trial.questions_to_ask_oncologist.length > 0 && (
          <div
            style={{
              padding: "14px 16px",
              background: "var(--surface-2)",
              borderRadius: "var(--r-md)",
              marginBottom: 20,
            }}
          >
            <div className="eyebrow" style={{ marginBottom: 6 }}>
              Questions for your oncologist
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                color: "var(--ink-2)",
                lineHeight: 1.5,
                fontSize: 14,
              }}
            >
              {trial.questions_to_ask_oncologist.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
        )}

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
