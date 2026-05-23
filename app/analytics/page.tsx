"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type Overview = {
  patients: number;
  symptom_logs: number;
  medications: number;
  query_ms: number;
};

type MedImpactRow = {
  medication: string;
  symptom: string;
  avg_before: number;
  avg_after: number;
  delta: number;
  n_before: number;
  n_after: number;
};

type MedImpactResponse = {
  rows: MedImpactRow[];
  query_ms: number;
};

type TrendPoint = {
  day: string;
  symptom_name: string;
  avg_score: number;
  n: number;
};

type TrendsResponse = {
  rows: TrendPoint[];
  query_ms: number;
};

// ── Color helpers (same hash as SymptomChart) ─────────────────────────────────

const PALETTE = [
  "var(--ink)",
  "var(--sage)",
  "var(--clay)",
  "var(--plum)",
  "var(--warn)",
  "var(--alert)",
];

function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LatencyBadge({ ms }: { ms: number }) {
  return (
    <span
      className="eyebrow"
      style={{ color: "var(--muted)", fontSize: 11, fontWeight: 400 }}
    >
      {ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`} · ClickHouse
    </span>
  );
}

function KpiCard({
  label,
  value,
  queryMs,
}: {
  label: string;
  value: number;
  queryMs: number;
}) {
  return (
    <div className="card" style={{ flex: 1, minWidth: 160, padding: "24px 28px" }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>
        {label}
      </div>
      <div
        className="h-display"
        style={{ fontSize: 36, lineHeight: 1, marginBottom: 6 }}
      >
        {value.toLocaleString()}
      </div>
      <LatencyBadge ms={queryMs} />
    </div>
  );
}

// ── Medication impact chart ───────────────────────────────────────────────────

function MedicationImpactChart({
  data,
  queryMs,
}: {
  data: MedImpactRow[];
  queryMs: number;
}) {
  // Build bar entries: label = "MedName · Symptom", value = delta (positive = improved)
  const bars = data
    .filter((r) => Math.abs(r.delta) >= 0.1)
    .map((r) => ({
      label: `${r.medication.split(" ")[0]} · ${r.symptom}`,
      delta: r.delta,
      medication: r.medication,
      symptom: r.symptom,
      avg_before: r.avg_before,
      avg_after: r.avg_after,
      n: r.n_before + r.n_after,
    }))
    .slice(0, 20);

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: typeof bars[0] }[] }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "10px 14px",
          fontSize: 12,
          color: "var(--ink)",
        }}
      >
        <div style={{ fontWeight: 600, marginBottom: 4 }}>{d.medication}</div>
        <div style={{ color: "var(--muted)", marginBottom: 6 }}>
          {d.symptom}
        </div>
        <div>
          Before:{" "}
          <strong>{d.avg_before.toFixed(1)}</strong> → After:{" "}
          <strong>{d.avg_after.toFixed(1)}</strong>
        </div>
        <div style={{ marginTop: 4, color: d.delta > 0 ? "var(--sage)" : "var(--clay)" }}>
          {d.delta > 0 ? `▼ ${d.delta.toFixed(1)} pts improvement` : `▲ ${Math.abs(d.delta).toFixed(1)} pts worse`}
        </div>
        <div style={{ marginTop: 4, color: "var(--muted)", fontSize: 11 }}>
          {d.n.toLocaleString()} data points
        </div>
      </div>
    );
  };

  return (
    <div className="card" style={{ padding: 28 }} data-enter>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div className="eyebrow">Medication Impact</div>
        <LatencyBadge ms={queryMs} />
      </div>
      <div className="h-display" style={{ fontSize: 22, marginBottom: 4 }}>
        Symptom change in the 14 days after starting each medication.
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 20px" }}>
        Positive bars = symptom improved (score dropped). Negative = symptom worsened.
        Across all patients who received each medication.
      </p>
      <div style={{ width: "100%", height: Math.max(280, bars.length * 28) }}>
        <ResponsiveContainer>
          <BarChart
            data={bars}
            layout="vertical"
            margin={{ top: 4, right: 40, bottom: 4, left: 160 }}
          >
            <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              type="number"
              domain={["auto", "auto"]}
              stroke="var(--muted-2)"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              tickFormatter={(v: number) => (v > 0 ? `+${v.toFixed(1)}` : v.toFixed(1))}
            />
            <YAxis
              type="category"
              dataKey="label"
              width={155}
              stroke="var(--muted-2)"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--surface-2)" }} />
            <ReferenceLine x={0} stroke="var(--border)" strokeWidth={1.5} />
            <Bar dataKey="delta" radius={[0, 4, 4, 0]}>
              {bars.map((entry, index) => (
                <Cell
                  key={index}
                  fill={entry.delta > 0 ? "var(--sage)" : "var(--clay)"}
                  fillOpacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Population trend chart ────────────────────────────────────────────────────

function PopulationTrendChart({
  rawRows,
  queryMs,
  patientCount,
}: {
  rawRows: TrendPoint[];
  queryMs: number;
  patientCount: number;
}) {
  // Pivot: [{ day, fatigue: avg, nausea: avg, ... }]
  const dayMap: Record<string, Record<string, number>> = {};
  const symptomSet = new Set<string>();

  for (const r of rawRows) {
    if (!dayMap[r.day]) dayMap[r.day] = { day: r.day };
    dayMap[r.day][r.symptom_name] = r.avg_score;
    symptomSet.add(r.symptom_name);
  }

  const chartData = Object.values(dayMap).sort((a, b) =>
    String(a.day).localeCompare(String(b.day))
  );

  const symptoms = Array.from(symptomSet).sort();

  // Sample every 3rd day so the x-axis labels aren't crowded
  const tickDays = chartData
    .filter((_, i) => i % 7 === 0)
    .map((r) => r.day);

  return (
    <div className="card" style={{ padding: 28 }} data-enter>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div className="eyebrow">Population Symptom Trends</div>
        <LatencyBadge ms={queryMs} />
      </div>
      <div className="h-display" style={{ fontSize: 22, marginBottom: 4 }}>
        Average symptom score across {patientCount.toLocaleString()} patients, last 90 days.
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13, margin: "0 0 20px" }}>
        Scores 1–10 (higher = worse). Dips reflect medication effects across the cohort.
      </p>
      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer>
          <LineChart
            data={chartData}
            margin={{ top: 12, right: 16, bottom: 0, left: -8 }}
          >
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="day"
              stroke="var(--muted-2)"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
              ticks={tickDays}
              tickFormatter={(d: string) => d.slice(5)}
            />
            <YAxis
              domain={[1, 10]}
              stroke="var(--muted-2)"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                fontSize: 12,
                color: "var(--ink)",
              }}
              labelStyle={{ color: "var(--muted)" }}
              formatter={(v: number, name: string) => [v.toFixed(2), name]}
            />
            {symptoms.map((s) => (
              <Line
                key={s}
                type="monotone"
                dataKey={s}
                name={s}
                stroke={colorFor(s)}
                strokeWidth={1.6}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
        {symptoms.map((s) => (
          <span key={s} className="pill">
            <span className="dot" style={{ background: colorFor(s) }} />
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [medImpact, setMedImpact] = useState<MedImpactResponse | null>(null);
  const [trends, setTrends] = useState<TrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [ov, mi, tr] = await Promise.all([
          api<Overview>("/analytics/overview"),
          api<MedImpactResponse>("/analytics/medication-impact"),
          api<TrendsResponse>("/analytics/symptom-trends"),
        ]);
        setOverview(ov);
        setMedImpact(mi);
        setTrends(tr);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  return (
    <main className="page">
      <div className="container" style={{ paddingTop: 32, paddingBottom: 64 }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          Cohort Analytics
        </div>
        <h1 className="h-display" style={{ marginBottom: 8 }}>
          Population-scale insights.
        </h1>
        <p className="lede" style={{ marginBottom: 32 }}>
          Real-time aggregation across all patients and symptom logs — powered by
          ClickHouse.
        </p>

        {loading && (
          <div
            style={{ color: "var(--muted)", fontSize: 14, textAlign: "center", padding: 64 }}
          >
            Querying ClickHouse…
          </div>
        )}

        {error && (
          <div className="card" style={{ padding: 24, color: "var(--clay)" }}>
            {error}
          </div>
        )}

        {!loading && !error && overview && medImpact && trends && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* KPI row */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <KpiCard
                label="Patients"
                value={overview.patients}
                queryMs={overview.query_ms}
              />
              <KpiCard
                label="Symptom data points"
                value={overview.symptom_logs}
                queryMs={overview.query_ms}
              />
              <KpiCard
                label="Medication records"
                value={overview.medications}
                queryMs={overview.query_ms}
              />
            </div>

            {/* Medication impact */}
            {medImpact.rows.length > 0 ? (
              <MedicationImpactChart
                data={medImpact.rows}
                queryMs={medImpact.query_ms}
              />
            ) : (
              <div className="card" style={{ padding: 28 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>Medication Impact</div>
                <p style={{ color: "var(--muted)", fontSize: 14 }}>
                  No medication data yet.{" "}
                  <code style={{ fontSize: 12 }}>POST /admin/seed-mock-cohort</code>{" "}
                  to populate the cohort.
                </p>
              </div>
            )}

            {/* Population trends */}
            {trends.rows.length > 0 ? (
              <PopulationTrendChart
                rawRows={trends.rows}
                queryMs={trends.query_ms}
                patientCount={overview.patients}
              />
            ) : (
              <div className="card" style={{ padding: 28 }}>
                <div className="eyebrow" style={{ marginBottom: 8 }}>
                  Population Symptom Trends
                </div>
                <p style={{ color: "var(--muted)", fontSize: 14 }}>
                  No symptom log data yet. Seed the mock cohort to see trends.
                </p>
              </div>
            )}

            <p
              className="eyebrow"
              style={{
                color: "var(--muted)",
                fontSize: 11,
                textAlign: "center",
                marginTop: 8,
              }}
            >
              Population data · not linked to individual patients · for demonstration purposes
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
