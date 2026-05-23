import type { SummaryResponse } from "@/lib/types";

export function SymptomSummary({ data }: { data: SummaryResponse }) {
  return (
    <div className="card" style={{ padding: 24 }} data-enter>
      <div className="eyebrow" style={{ marginBottom: 6 }}>
        Weekly read
      </div>
      <div className="h-display" style={{ fontSize: 22, marginBottom: 16 }}>
        What it looks like to me.
      </div>
      <p className="lede" style={{ marginBottom: 20 }}>
        {data.summary}
      </p>
      {data.alerts.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {data.alerts.map((alert, i) => (
            <span key={i} className="pill pill-clay">
              <span className="dot warn" />
              {alert}
            </span>
          ))}
        </div>
      )}
      <p
        style={{
          marginTop: 24,
          fontSize: 12,
          color: "var(--muted-2)",
          letterSpacing: "-0.005em",
        }}
      >
        This summary is for understanding only — not medical advice.
      </p>
    </div>
  );
}
