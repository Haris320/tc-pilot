export default function Home() {
  return (
    <div className="container" style={{ paddingTop: 80, paddingBottom: 80 }}>
      <div className="eyebrow" style={{ marginBottom: 16 }}>
        Home
      </div>
      <h1 className="h-display" style={{ fontSize: 56, marginBottom: 16 }}>
        Good morning.
      </h1>
      <p className="lede" style={{ marginBottom: 32 }}>
        A quiet, capable companion for the harder days. Log how you&apos;re
        feeling, translate the report, prep for the next visit.
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        <button className="btn btn-primary">Log today&apos;s symptoms</button>
        <button className="btn btn-ghost">Translate a report</button>
      </div>

      <div
        style={{
          marginTop: 80,
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 20,
        }}
      >
        {[
          { eyebrow: "Symptoms", title: "How are you feeling?" },
          { eyebrow: "Pathology", title: "Paste your report." },
          { eyebrow: "Questions", title: "For your next visit." },
          { eyebrow: "Trials", title: "Trials that may fit." },
        ].map((tile) => (
          <div key={tile.eyebrow} className="card" style={{ padding: 24 }}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>
              {tile.eyebrow}
            </div>
            <div
              className="h-display"
              style={{ fontSize: 24, marginBottom: 12 }}
            >
              {tile.title}
            </div>
            <button className="btn btn-ghost btn-sm">Open →</button>
          </div>
        ))}
      </div>
    </div>
  );
}
