"use client";

import { useState } from "react";
import { Search } from "lucide-react";

type Props = {
  defaultCancerType: string;
  defaultLocation: string;
  onSearch: (req: { cancerType: string; location: string; requirements: string }) => Promise<void> | void;
  pending: boolean;
};

export function TrialFinder({
  defaultCancerType,
  defaultLocation,
  onSearch,
  pending,
}: Props) {
  const [cancerType, setCancerType] = useState(defaultCancerType);
  const [location, setLocation] = useState(defaultLocation);
  const [requirements, setRequirements] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch({ cancerType, location, requirements });
  };

  return (
    <form onSubmit={submit} className="card" style={{ padding: 28 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div>
          <label
            className="eyebrow"
            style={{ display: "block", marginBottom: 8 }}
          >
            Cancer type
          </label>
          <input
            className="input"
            value={cancerType}
            onChange={(e) => setCancerType(e.target.value)}
            disabled={pending}
          />
        </div>
        <div>
          <label
            className="eyebrow"
            style={{ display: "block", marginBottom: 8 }}
          >
            City
          </label>
          <input
            className="input"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            disabled={pending}
          />
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label className="eyebrow" style={{ display: "block", marginBottom: 8 }}>
          Any specific requirements?{" "}
          <span style={{ textTransform: "none", color: "var(--muted-2)" }}>
            (optional)
          </span>
        </label>
        <input
          className="input"
          placeholder='e.g. "no surgery", "phase 3 only", "near Boston"'
          value={requirements}
          onChange={(e) => setRequirements(e.target.value)}
          disabled={pending}
        />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          <Search size={14} strokeWidth={1.8} />
          {pending ? "Searching…" : "Search trials"}
        </button>
      </div>
    </form>
  );
}
