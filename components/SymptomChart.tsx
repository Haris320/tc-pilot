"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartRow, Symptom } from "@/lib/types";

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

type Props = {
  rows: ChartRow[];
  symptoms: Symptom[];
};

export function SymptomChart({ rows, symptoms }: Props) {
  return (
    <div className="card" style={{ padding: 24 }} data-enter>
      <div className="eyebrow" style={{ marginBottom: 6 }}>
        Last 14 days
      </div>
      <div
        className="h-display"
        style={{ fontSize: 22, marginBottom: 16 }}
      >
        How the past two weeks looked.
      </div>
      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 12, right: 16, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="day"
              stroke="var(--muted-2)"
              fontSize={11}
              tickFormatter={(d: string) => d.slice(5)}
              tickLine={false}
              axisLine={{ stroke: "var(--border)" }}
            />
            <YAxis
              domain={[0, 10]}
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
            />
            {symptoms.map((s) => (
              <Line
                key={s.symptom_name}
                type="monotone"
                dataKey={s.symptom_name}
                name={s.display_name}
                stroke={colorFor(s.symptom_name)}
                strokeWidth={1.6}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
        {symptoms.map((s) => (
          <span key={s.symptom_name} className="pill">
            <span
              className="dot"
              style={{ background: colorFor(s.symptom_name) }}
            />
            {s.display_name}
          </span>
        ))}
      </div>
    </div>
  );
}
