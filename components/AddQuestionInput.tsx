"use client";

import { useState } from "react";

type Props = {
  onAdd: (text: string) => void;
};

export function AddQuestionInput({ onAdd }: Props) {
  const [text, setText] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAdd(text.trim());
    setText("");
  };

  return (
    <form
      onSubmit={submit}
      className="card no-print"
      style={{ padding: 20, display: "flex", gap: 8 }}
    >
      <input
        className="input"
        placeholder="Add something you want to ask…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        style={{ flex: 1 }}
      />
      <button className="btn btn-ghost" type="submit" disabled={!text.trim()}>
        Add
      </button>
    </form>
  );
}
