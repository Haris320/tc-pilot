"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { Symptom, ValidateResponse } from "@/lib/types";

type Props = {
  onAdd: (symptom: Symptom) => void;
};

export function AddSymptomInput({ onAdd }: Props) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setPending(true);

    // TODO(backend): POST /symptom-validate { symptomText: text }
    // Mock the response with a friendly accept for any non-empty string.
    await new Promise((r) => setTimeout(r, 500));
    const slug = text.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
    const res: ValidateResponse = {
      valid: true,
      symptom_name: slug || "custom",
      display_name: text.trim(),
      message: `${text.trim()} is a known side effect — added to your tracker.`,
    };

    if (res.valid && res.symptom_name && res.display_name) {
      onAdd({
        symptom_name: res.symptom_name,
        display_name: res.display_name,
        is_default: false,
      });
      toast.success(res.message);
      setText("");
    } else {
      toast.message(res.message);
    }
    setPending(false);
  };

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 8, marginTop: 16 }}>
      <input
        className="input"
        placeholder="Track something else? e.g. ear ringing"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={pending}
        style={{ flex: 1 }}
      />
      <button className="btn btn-ghost" type="submit" disabled={pending || !text.trim()}>
        {pending ? "Checking…" : "Is this a TC symptom?"}
      </button>
    </form>
  );
}
