import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MOCK_PROFILE } from "@/lib/mocks";

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

  // In the mock phase, profile/name come from the fixture.
  // Once the backend lands, swap to `await api<Profile>("/profile", { patientId })`.
  const name = MOCK_PROFILE.name;

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
