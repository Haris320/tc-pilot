"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
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
    try {
      const res = await api<ValidateResponse>("/symptom-validate", {
        body: { symptomText: text.trim() },
      });
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
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Couldn't check that symptom.";
      toast.error(msg);
    } finally {
      setPending(false);
    }
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
