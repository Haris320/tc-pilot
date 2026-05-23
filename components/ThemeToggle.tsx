"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        width: 60,
        height: 30,
        padding: 3,
        borderRadius: 999,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        cursor: "pointer",
        transition: "background .25s ease, border-color .25s ease",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: 8,
          top: 0,
          bottom: 0,
          display: "flex",
          alignItems: "center",
          color: dark ? "var(--muted-2)" : "var(--clay-ink)",
          opacity: dark ? 0.5 : 1,
          transition: "opacity .25s, color .25s",
          pointerEvents: "none",
        }}
      >
        <Sun size={12} strokeWidth={1.6} />
      </span>
      <span
        style={{
          position: "absolute",
          right: 8,
          top: 0,
          bottom: 0,
          display: "flex",
          alignItems: "center",
          color: dark ? "var(--sage-ink)" : "var(--muted-2)",
          opacity: dark ? 1 : 0.5,
          transition: "opacity .25s, color .25s",
          pointerEvents: "none",
        }}
      >
        <Moon size={11} strokeWidth={1.6} />
      </span>
      <span
        style={{
          position: "absolute",
          top: 3,
          left: 3,
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: dark ? "var(--ink)" : "var(--surface)",
          boxShadow: "var(--shadow-md)",
          transform: dark ? "translateX(30px)" : "translateX(0)",
          transition:
            "transform .28s cubic-bezier(.5,1.2,.4,1), background .25s",
          border: "1px solid var(--border)",
        }}
      />
    </button>
  );
}
