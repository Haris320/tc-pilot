import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import type { Profile } from "@/lib/types";

const TILES = [
  { href: "/symptoms", eyebrow: "Symptoms", title: "How are you feeling?" },
  { href: "/pathology", eyebrow: "Pathology", title: "Paste your report." },
  { href: "/questions", eyebrow: "Questions", title: "For your next visit." },
  { href: "/trials", eyebrow: "Trials", title: "Trials that may fit." },
];

export default async function Home() {
  const cookieStore = await cookies();
  const patientId = cookieStore.get("patient_id")?.value;
  if (!patientId) redirect("/onboarding");

  let name: string | undefined;
  try {
    const profile = await api<Profile>("/profile", { patientId });
    name = profile.name ?? undefined;
  } catch (err) {
    // 404 means the cookie is stale (profile missing) — send back to onboarding.
    if (err instanceof ApiError && err.status === 404) redirect("/onboarding");
    // Other errors: render the page without a name rather than hard-failing.
  }

  return (
    <div className="container">
      <section className="hero">
        <div className="eyebrow">Home</div>
        <h1 className="h-display">
          Good morning{name ? `, ${name}` : ""}.
        </h1>
        <p className="lede" style={{ marginBottom: 32 }}>
          A quiet, capable companion for the harder days. Log how you&apos;re
          feeling, translate the report, prep for the next visit.
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          <Link href="/symptoms" className="btn btn-primary">
            Log today&apos;s symptoms
          </Link>
          <Link href="/pathology" className="btn btn-ghost">
            Translate a report
          </Link>
        </div>
      </section>

      <section style={{ paddingBottom: 80 }}>
        <div className="tile-grid">
          {TILES.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="card tile"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <div className="eyebrow">{t.eyebrow}</div>
              <h2 className="h-display">{t.title}</h2>
              <span className="btn btn-ghost btn-sm" style={{ pointerEvents: "none" }}>
                Open →
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
