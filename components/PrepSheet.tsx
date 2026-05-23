type Theme = {
  heading: string;
  questions: string[];
};

export function PrepSheet({ themes }: { themes: Theme[] }) {
  return (
    <div className="card" style={{ padding: 32 }} data-enter>
      <div className="eyebrow" style={{ marginBottom: 6 }}>
        Prep sheet
      </div>
      <div className="h-display" style={{ fontSize: 28, marginBottom: 20 }}>
        For your next visit.
      </div>
      <div style={{ display: "grid", gap: 24 }}>
        {themes.map((theme, i) => (
          <div key={i}>
            <h3
              className="h-display"
              style={{ fontSize: 18, marginBottom: 10 }}
            >
              {theme.heading}
            </h3>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {theme.questions.map((q, j) => (
                <li
                  key={j}
                  style={{
                    color: "var(--ink)",
                    lineHeight: 1.6,
                    marginBottom: 6,
                  }}
                >
                  {q}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
