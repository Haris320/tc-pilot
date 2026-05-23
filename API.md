# API.md — Frontend ↔ FastAPI contract

Both engineers edit this. If a shape changes here, the corresponding Pydantic model in `backend/app/models.py` and TypeScript type in `lib/types.ts` change in the same commit.

## Conventions

- **Base URL**: `NEXT_PUBLIC_API_URL` (frontend) / `app.main` mount root (backend). Default `http://localhost:8000`.
- **Patient identity**: every request carries `X-Patient-Id: <uuid>` (forwarded from the `patient_id` cookie by [lib/api.ts](lib/api.ts)). The FastAPI dependency in `backend/app/deps.py` reads it and injects `patient_id: str` into every handler. Endpoints that do not require identity (health checks, setup) ignore it.
- **CORS**: backend allow-list is `http://localhost:3000` for dev and the Vercel URL for prod. Set via `FRONTEND_ORIGIN` env var.
- **Content type**: JSON in, JSON out. `Content-Type: application/json` on every POST.
- **Errors**: non-2xx returns `{ "message": string, "detail"?: unknown }`. The frontend wrapper throws `ApiError` with `status` and `body`.
- **Idempotency**: any insert that can be reasonably re-played (e.g. doctor-questions, table setup) is idempotent on its natural key. Spelled out per endpoint below.
- **Datadog**: every Claude call inside a handler passes `feature_tag` into `call_claude(...)`. Allowed values: `pathology`, `symptom-validate`, `symptom-summary`, `trial-finder`, `doctor-questions`. See [CLAUDE.md §8](CLAUDE.md).

## Status legend

- ✅ live in mock — frontend already builds against this shape
- ⏳ planned — agreed shape, not implemented either side
- 🛠 in progress — being implemented

---

## Health checks (Phase 1 gates — do not skip)

### `POST /setup`
Idempotent — runs `CREATE TABLE IF NOT EXISTS` for all four tables. Call once after deploy.

**Response** `200`
```json
{ "ok": true, "tables": ["patient_profiles", "patient_symptoms", "symptom_logs", "doctor_questions"] }
```

### `GET /health/clickhouse` ⏳
Inserts one `health-check-{timestamp}` row into `patient_profiles`, reads it back.

**Response** `200`
```json
{ "writeOk": true, "readOk": true, "row": { "patient_id": "health-check-1715900000", "...": "..." } }
```

**Gate**: row visible in ClickHouse Cloud SQL console.

### `GET /health/datadog` ⏳
Makes one cheapest-possible Claude call + one ClickHouse read so a full trace lands in APM.

**Response** `200`
```json
{ "ok": true, "traceId": "..." }
```

**Gate**: service `tc-copilot` appears in Datadog APM **and** in LLM Observability with prompt + completion text **and** `total_cost_usd` populated on the span.

### `GET /health/claude` ⏳
Runs `call_claude` with a one-liner and asserts JSON parses.

**Response** `200` → `{ "ok": true, "echo": <parsed-json> }`

### `GET /health/nimble` ⏳
Hits Nimble's render endpoint against a fixed CT.gov query.

**Response** `200` → `{ "ok": true, "resultCount": 12 }`

---

## Profile

### `POST /profile` ⏳
Create or update the patient profile. Identity comes from the `X-Patient-Id` header.

**Request**
```ts
{
  name?: string;
  cancer_type: string;     // "Testicular Cancer" (frontend hard-sets)
  stage: "I" | "II" | "III";
  location: string;        // city
}
```

**Response** `200`
```ts
{
  patient_id: string;
  name?: string;
  cancer_type: string;
  stage: "I" | "II" | "III";
  location: string;
  created_at: string;      // ISO-8601
}
```

### `GET /profile` ⏳
Returns the current profile or `404` if none.

**Response** `200` → same shape as `POST /profile` response.

---

## Symptoms

### `POST /symptoms/seed` ⏳
Inserts the four default symptoms (`fatigue`, `nausea`, `neuropathy`, `pain`) for the current patient. **Idempotent** — re-running does not duplicate rows (ClickHouse `ReplacingMergeTree` on `(patient_id, symptom_name)`).

**Request** — empty `{}`.

**Response** `200`
```ts
{ inserted: 4 }
```

### `GET /symptoms` ⏳
List the patient's tracked symptoms in display order (defaults first by `added_at`).

**Response** `200`
```ts
{
  symptoms: Array<{
    symptom_name: string;     // slug, e.g. "tinnitus"
    display_name: string;     // human label, e.g. "Ear Ringing (Tinnitus)"
    is_default: boolean;
  }>;
}
```

### `POST /symptom-log` ⏳
Writes N rows into `symptom_logs` — one per symptom in the submit. All rows share the same `logged_at`.

**Request**
```ts
{
  scores: Array<{
    symptom_name: string;
    score: number;     // 1-10
  }>;
}
```

**Response** `200`
```ts
{ inserted: number; logged_at: string }   // ISO-8601
```

### `POST /symptom-validate` ⏳
Calls Claude (`feature_tag = "symptom-validate"`) to check whether a free-text symptom is a known TC/BEP side effect. On `valid: true`, inserts into `patient_symptoms` (`is_default = 0`). Idempotent on `(patient_id, symptom_name)`.

**Request**
```ts
{ symptomText: string }
```

**Response** `200`
```ts
{
  valid: boolean;
  symptom_name?: string;   // present only when valid
  display_name?: string;   // present only when valid
  message: string;         // user-facing — gentle, never red
}
```

### `GET /symptom-summary` ⏳
Reads the last 14 days of `symptom_logs` for the patient, pivots day × symptom server-side (see SQL in [CLAUDE.md §6](CLAUDE.md)), passes the pivot to Claude (`feature_tag = "symptom-summary"`), returns the parsed summary + alerts.

**Response** `200`
```ts
{
  summary: string;
  alerts: string[];        // one per concerning trend
  chart: Array<{           // row-per-day, ready for Recharts
    day: string;           // YYYY-MM-DD
    [symptom_name: string]: string | number;
  }>;
}
```

**Note**: `chart` is included so the frontend never re-fetches separately. Each symptom name becomes a key with average daily score; missing days are skipped, missing symptoms on a present day default to `null`.

### `POST /symptoms/seed-demo-history` ⏳
Writes 14 days of realistic logs for the calling patient. Demo helper — Haris calls it once before the live demo. **Idempotent** — re-running replaces the existing 14-day window.

**Request** — empty `{}`.

**Response** `200` → `{ inserted: number }`

---

## Pathology

### `POST /translate-report` ⏳
Claude pass (`feature_tag = "pathology"`) over a pasted report.

**Request**
```ts
{ reportText: string }
```

**Response** `200`
```ts
{
  explanation: string;     // may contain **bold** markdown
  questions: string[];     // 4-5 items
}
```

After a `200`, the frontend posts the questions to `/doctor-questions` with `source: "report"` (see below).

---

## Doctor questions

### `GET /doctor-questions` ⏳
Returns active items for the patient, plus runs the symptom-alert derivation: pulls `alerts[]` from `/symptom-summary` and upserts each as a `source: "symptom-alert"` item (idempotent on `(patient_id, source, text)`).

**Response** `200`
```ts
{
  items: Array<{
    id: string;
    source: "report" | "symptom-alert" | "self";
    text: string;
    added_at: string;       // ISO-8601
    done: boolean;
  }>;
}
```

Order: newest first within source, sources ordered `symptom-alert → report → self`.

### `POST /doctor-questions` ⏳
Insert one or many items. Idempotent on `(patient_id, source, text)`.

**Request** (two shapes accepted)
```ts
// single
{ source: "report" | "symptom-alert" | "self"; text: string }

// batch (used by /translate-report follow-up)
{ source: "report"; items: string[] }
```

**Response** `200`
```ts
{ inserted: number; ids: string[] }
```

### `POST /doctor-questions/{id}/done` ⏳
Mark an item done. PathParam `id`.

**Response** `200`
```ts
{ id: string; done: true }
```

### `POST /doctor-questions/summarise` ⏳
Claude pass (`feature_tag = "doctor-questions"`) that dedupes / themes / orders the active list into a printable prep sheet.

**Request** — empty `{}`.

**Response** `200`
```ts
{
  themes: Array<{
    heading: string;
    questions: string[];
  }>;
}
```

---

## Trials

### `POST /find-trials` ⏳ (partner-owned)
Pulls `cancer_type` + `location` from `patient_profiles`, accepts free-text requirements, calls Nimble against `https://clinicaltrials.gov/search`, passes raw HTML/JSON to Claude (`feature_tag = "trial-finder"`), returns the top 3 trials.

**Request**
```ts
{
  cancerType: string;      // overrides profile if present
  location: string;
  requirements?: string;   // free text, e.g. "no surgery", "phase 3 only"
}
```

**Response** `200`
```ts
{
  trials: Array<{
    name: string;
    phase: string;         // "Phase 3", "Phase 2", "Observational", etc.
    location: string;
    summary: string;       // 2-3 plain sentences
    eligibility: string;   // one sentence
    url: string;
  }>;
}
```

Empty results return `{ "trials": [] }` — frontend renders the "No matches in your area" empty state.

---

## Open questions to lock down

- Does `GET /symptom-summary` need a `?days=14` query param, or is 14 always the window? (Currently hardcoded.)
- Should `POST /doctor-questions/{id}/done` accept `{ done: false }` to undo, or do we need a separate route? Frontend currently expects a toggle.
- For `/find-trials`, do we cap at 3 results in the backend or let Claude decide? Plan says 3 — backend should enforce.
- Profile name: optional everywhere? Frontend currently treats it as optional.
