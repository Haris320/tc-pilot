"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { newPatientId, setPatientId } from "@/lib/patient";

const STAGES = ["I", "II", "III"] as const;
type Stage = (typeof STAGES)[number];

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [stage, setStage] = useState<Stage>("II");
  const [location, setLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!location.trim()) {
      toast.error("Please enter your city.");
      return;
    }
    setSubmitting(true);
    const id = newPatientId();
    setPatientId(id);
    // TODO(backend): POST /profile and POST /symptoms/seed
    // For now the cookie + mock fixtures carry the demo.
    toast.success("All set.");
    router.replace("/");
  };

  return (
    <div className="container" style={{ maxWidth: 640 }}>
      <section className="hero">
        <div className="eyebrow">Onboarding</div>
        <h1 className="h-display">Let&apos;s set things up.</h1>
        <p className="lede">
          A few quick details so the rest of the app feels personal. Nothing
          leaves your device that you don&apos;t put here yourself.
        </p>
      </section>

      <form onSubmit={onSubmit} className="card" style={{ padding: 32 }}>
        <div style={{ marginBottom: 24 }}>
          <label
            className="eyebrow"
            style={{ display: "block", marginBottom: 8 }}
          >
            Your name <span style={{ textTransform: "none", color: "var(--muted-2)" }}>(optional)</span>
          </label>
          <input
            className="input"
            type="text"
            placeholder="Alex"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label
            className="eyebrow"
            style={{ display: "block", marginBottom: 8 }}
          >
            Stage
          </label>
          <div className="toggle-group" aria-label="Stage">
            {STAGES.map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={stage === s}
                onClick={() => setStage(s)}
                className="toggle"
              >
                Stage {s}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 32 }}>
          <label
            className="eyebrow"
            style={{ display: "block", marginBottom: 8 }}
          >
            City
          </label>
          <input
            className="input"
            type="text"
            placeholder="Boston"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            autoComplete="address-level2"
            required
          />
        </div>

        <div
          className="pill"
          style={{ marginBottom: 24, height: 32, fontSize: 12.5 }}
        >
          <span className="dot muted" />
          Cancer type: Testicular Cancer
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting}
          >
            {submitting ? "Saving…" : "Continue"}
          </button>
        </div>
      </form>
    </div>
  );
}
