import type { TranslateResponse } from "@/lib/types";

export function ReportOutput({ data }: { data: TranslateResponse }) {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="card" style={{ padding: 32 }} data-enter>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Plain English
        </div>
        <div className="h-display" style={{ fontSize: 24, marginBottom: 16 }}>
          What the report says.
        </div>
        {data.explanation.split("\n\n").map((para, i) => (
          <p
            key={i}
            className="lede"
            style={{ marginBottom: 16, maxWidth: "none" }}
            dangerouslySetInnerHTML={{ __html: renderInline(para) }}
          />
        ))}
        <p
          style={{
            marginTop: 8,
            fontSize: 12,
            color: "var(--muted-2)",
          }}
        >
          This explanation is for understanding only — not medical advice.
        </p>
      </div>

      <div className="card" style={{ padding: 32 }} data-enter>
        <div className="eyebrow" style={{ marginBottom: 6 }}>
          Bring to your appointment
        </div>
        <div className="h-display" style={{ fontSize: 24, marginBottom: 16 }}>
          Questions to ask your oncologist.
        </div>
        <ol style={{ paddingLeft: 0, margin: 0, listStyle: "none" }}>
          {data.questions.map((q, i) => (
            <li
              key={i}
              style={{
                display: "flex",
                gap: 14,
                padding: "12px 0",
                borderBottom:
                  i < data.questions.length - 1
                    ? "1px solid var(--border)"
                    : "none",
              }}
            >
              <span
                className="pill"
                style={{
                  height: 24,
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  flex: "0 0 auto",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span style={{ color: "var(--ink)", lineHeight: 1.55 }}>{q}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** Tiny markdown-ish helper: only handles **bold** so we can keep prompt output rich. */
function renderInline(s: string): string {
  return escapeHtml(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
