# TC Co-pilot — CLAUDE.md

Source of truth for any coding agent working in this repo. Read it top to bottom before editing anything.

---

## 1. What this product does

TC Co-pilot is a companion app for testicular cancer patients. It helps a patient:

1. **Translate pathology reports** into plain English (Pathology)
2. **Track symptoms** week-over-week through chemotherapy (Symptoms)
3. **Prep for appointments** with one aggregated list of questions (Questions)
4. **Find clinical trials** using live ClinicalTrials.gov data (Trials)

It is a navigation tool, not a diagnostic tool. No medical prediction, no risk scoring, no FDA-regulated functionality. Every Claude output ends in a small muted disclaimer.

Built for the Agentic Engineering Hackathon. Practice run lives at `/Users/haris/code/applications/tc-demo` — its `CLAUDE.md` informed this spec but the data model now adds a `doctor_questions` table and the backend is Python.

---

## 2. Tech stack

**Frontend** (this directory)
- Next.js 16 (App Router, server components where possible) + TypeScript + Tailwind v4
- Fonts via `next/font/google`: **Instrument Serif** (display), **Geist** (sans), **Geist Mono** (mono)
- `recharts` (symptom chart), `lucide-react` (icons), `sonner` (toasts), `clsx`
- Deploys to **Vercel**

**Backend** (`./backend/`)
- Python 3.12 + **FastAPI** + Pydantic v2, served by `uvicorn` under `ddtrace-run`
- `anthropic`, `clickhouse-connect`, `httpx`, `ddtrace`, `python-dotenv`
- Deploys to Fly.io or Render

**Sponsors and where they live**

| Sponsor | Single point of truth |
|---|---|
| Anthropic Claude (Sonnet 4) | `backend/app/lib/claude.py` |
| ClickHouse Cloud | `backend/app/lib/clickhouse.py` |
| Nimble (CT.gov scraper) | `backend/app/lib/nimble.py` |
| Datadog APM + LLMObs | `ddtrace-run uvicorn …` + `backend/app/lib/claude.py` annotation |
| Vercel | `vercel.json` (root) |

---

## 3. Repo layout

```
tc-pilot/
├── CLAUDE.md                  # this file
├── API.md                     # endpoint contracts — both engineers edit
├── app/
│   ├── layout.tsx             # fonts + ThemeProvider + TopBar
│   ├── globals.css            # design tokens (see §9)
│   ├── page.tsx               # /  Home / dashboard
│   ├── onboarding/page.tsx    # first-visit profile form
│   ├── symptoms/page.tsx
│   ├── pathology/page.tsx
│   ├── questions/page.tsx
│   └── trials/page.tsx        # partner-owned
├── components/
│   ├── TopBar.tsx
│   ├── BrandMark.tsx
│   ├── ThemeProvider.tsx
│   ├── ThemeToggle.tsx
│   ├── ReportInput.tsx
│   ├── ReportOutput.tsx
│   ├── SymptomForm.tsx
│   ├── AddSymptomInput.tsx
│   ├── SymptomChart.tsx
│   ├── SymptomSummary.tsx
│   ├── QuestionList.tsx
│   └── TrialCard.tsx          # partner-owned
├── lib/
│   └── api.ts                 # single fetch wrapper → NEXT_PUBLIC_API_URL
├── public/
└── backend/
    ├── pyproject.toml
    ├── .env / .env.example
    └── app/
        ├── main.py            # FastAPI app, CORS, ddtrace init
        ├── models.py          # Pydantic request/response shapes
        ├── deps.py            # X-Patient-Id dependency
        ├── lib/
        │   ├── claude.py
        │   ├── clickhouse.py
        │   └── nimble.py
        └── routes/
            ├── health.py
            ├── profile.py
            ├── symptoms.py
            ├── pathology.py
            ├── questions.py
            └── trials.py
```

---

## 4. Architecture rule (hard line — do not cross)

The frontend **never** holds an `ANTHROPIC_API_KEY`, `CLICKHOUSE_PASSWORD`, `NIMBLE_API_KEY`, or `DD_API_KEY`. All external calls happen server-side in FastAPI and pass through the one library wrapper per sponsor:

```
frontend  ─ fetch /…  ──▶  FastAPI route  ──▶  app/lib/{claude,clickhouse,nimble}.py  ──▶  sponsor
```

If you find yourself wanting to add a sponsor call somewhere else, stop and put it in `app/lib/…` first.

Patient identity flows as a cookie set on the frontend (`patient_id`, UUID, no auth) and forwarded as an `X-Patient-Id` header on every API call. The FastAPI dependency in `backend/app/deps.py` reads the header and injects `patient_id: str` into every handler.

---

## 5. Features

### 5.1 Pathology Report Translator — `/pathology`
- Route: `POST /translate-report` → `{ explanation: str, questions: list[str] }`
- After a successful response, the frontend also POSTs `/doctor-questions` with `{ source: "report", items: questions }` so they feed into 5.4
- Disclaimer rendered muted under the output: *"This explanation is for understanding only — not medical advice."*

### 5.2 Symptom Tracker — `/symptoms`
- **EAV pattern** — one row per symptom per log entry. Custom symptoms (e.g. tinnitus) can be added without ALTER TABLE.
- Routes:
  - `GET /symptoms` — patient's tracked symptom list
  - `POST /symptom-log` — N rows from N sliders
  - `POST /symptom-validate` — Claude check + insert on valid
  - `GET /symptom-summary` — 14-day pivot + Claude summary returning `{ summary, alerts[] }`
- Chart: Recharts line chart. Hash `symptom_name` → colour from `{sage, clay, plum, ink}`. No hardcoded colour per symptom.

### 5.3 Clinical Trial Finder — `/trials` (partner-owned)
- Route: `POST /find-trials` → `{ trials: Trial[] }` with `Trial = { name, phase, location, summary, eligibility, url }`
- Nimble scrape against `https://clinicaltrials.gov/search?cond=testicular+cancer&locStr={location}` then Claude pass to summarise the top 3.
- Empty state copy is honest: "No matches in your area — try widening the requirements."

### 5.4 Questions for the doctors — `/questions` (NEW)
- Aggregates three sources into one prep sheet:
  1. `report` — questions from the pathology translator
  2. `symptom-alert` — derived on the fly from `/symptom-summary` alerts (idempotent on `text`)
  3. `self` — patient-typed via the input on the page
- Routes:
  - `GET /doctor-questions` — list active items + derive symptom-alert items
  - `POST /doctor-questions` — insert (idempotent on `(patient_id, source, text)`)
  - `POST /doctor-questions/{id}/done` — mark complete
  - `POST /doctor-questions/summarise` — Claude pass that dedupes / themes the list into a printable prep sheet
- Print stylesheet hides nav and shows only the prep sheet card.

### 5.5 Patient Profile (onboarding)
- Route: `POST /profile`, `GET /profile`
- Onboarding form posts profile then `POST /symptoms/seed` to insert the four defaults (fatigue, nausea, neuropathy, pain) for the patient.
- Session: UUID cookie, no auth.

---

## 6. ClickHouse schemas

Run via `POST /setup` (idempotent — uses `CREATE TABLE IF NOT EXISTS`).

```sql
CREATE TABLE IF NOT EXISTS patient_profiles (
  patient_id    String,
  created_at    DateTime DEFAULT now(),
  cancer_type   String,
  stage         String,
  location      String
) ENGINE = ReplacingMergeTree() ORDER BY patient_id;

-- Seeded with 4 defaults on onboarding; extended on /symptom-validate.
CREATE TABLE IF NOT EXISTS patient_symptoms (
  patient_id      String,
  symptom_name    String,        -- slug: "fatigue", "tinnitus"
  display_name    String,        -- "Fatigue", "Ear Ringing (Tinnitus)"
  added_at        DateTime DEFAULT now(),
  is_default      UInt8          -- 1 = seeded, 0 = added by patient
) ENGINE = ReplacingMergeTree() ORDER BY (patient_id, symptom_name);

-- One row per symptom per log session (EAV).
CREATE TABLE IF NOT EXISTS symptom_logs (
  patient_id      String,
  logged_at       DateTime DEFAULT now(),
  symptom_name    String,
  score           UInt8          -- 1-10, higher = worse
) ENGINE = MergeTree() ORDER BY (patient_id, logged_at, symptom_name);

-- Aggregated prep sheet for the next appointment.
CREATE TABLE IF NOT EXISTS doctor_questions (
  id          String,            -- uuid
  patient_id  String,
  source      String,             -- 'report' | 'symptom-alert' | 'self'
  text        String,
  added_at    DateTime DEFAULT now(),
  done        UInt8 DEFAULT 0
) ENGINE = ReplacingMergeTree() ORDER BY (patient_id, added_at, id);
```

**Pivot SQL for the chart** (server-side, then JS row-per-day):
```sql
SELECT toDate(logged_at) AS day, symptom_name, avg(score) AS score
FROM symptom_logs
WHERE patient_id = {pid:String}
  AND logged_at >= now() - INTERVAL 14 DAY
GROUP BY day, symptom_name
ORDER BY day ASC;
```

---

## 7. Claude prompts

All calls go through `backend/app/lib/claude.py::call_claude(system, user, *, feature_tag, model="claude-sonnet-4-20250514")`. Return parsed JSON or `{"raw": text}` on parse failure. Tag spans with the feature so LLMObs groups cleanly.

### 7.1 Pathology translator
```
You are a compassionate medical translator helping a testicular cancer patient understand their pathology report. Explain exactly what is written in the report in plain, clear English — as if explaining to a smart friend with no medical background.

Rules:
- Only explain what is explicitly written in the report. Never add information not present.
- Define every medical term the first time it appears.
- Be accurate but warm in tone.
- After the explanation, generate 4-5 specific questions the patient should ask their oncologist at their next appointment, based only on what you found in the report.
- Return JSON: { "explanation": string, "questions": string[] }. No markdown, no preamble.
```

### 7.2 Symptom validate
```
You are a medical knowledge assistant for a testicular cancer patient tracking app.

Determine whether the described symptom is a known or commonly reported side effect of testicular cancer or its standard treatments — BEP chemotherapy (bleomycin, etoposide, cisplatin), orchiectomy, or radiation.

Examples of VALID: fatigue, nausea, neuropathy, tinnitus, hearing loss, hair loss, mouth sores, appetite loss, shortness of breath, swelling, back pain, abdominal pain, fever, bruising, cognitive fog.

If valid: set valid=true, provide a symptom_name slug (lowercase, no spaces), a clear display_name, and a one-sentence explanation of relevance.
If not: set valid=false and write a compassionate one-sentence message encouraging the patient to mention it to their doctor.

Return JSON: { "valid": boolean, "symptom_name": string, "display_name": string, "message": string }. No markdown, no preamble.
```

### 7.3 Weekly symptom summary
```
You are helping a testicular cancer patient understand how their symptoms have changed over the past two weeks of chemotherapy treatment.

Given symptom log data (scored 1-10, higher = worse), write a brief plain-English summary of what the trends show. The symptom list may vary per patient — work with whatever symptoms are present in the data.

Identify any symptoms that have increased by 2 or more points over the period — these are worth flagging to their oncologist.

Be compassionate but direct. Keep the summary to 3-4 sentences.
Return JSON: { "summary": string, "alerts": string[] }. No markdown, no preamble.
```

### 7.4 Trial finder
```
You are helping a testicular cancer patient find clinical trials that may be relevant to them.

Given raw data from ClinicalTrials.gov, identify the 3 most relevant trials for a patient with testicular cancer. For each trial, write a plain-English summary a non-medical person can understand.

Return a JSON array, each item: { name, phase, location, summary (2-3 sentences), eligibility (one sentence), url }. No markdown, no preamble.
```

### 7.5 Doctor-questions summariser
```
You are preparing a patient's appointment prep sheet from a mixed list of questions they have collected (from pathology reports, symptom trends, and their own notes).

Deduplicate near-identical questions, group related ones under short themed headings, and order by likely importance for the next oncology visit. Keep every distinct concern — do not drop questions.

Return JSON: { "themes": [{ "heading": string, "questions": string[] }] }. No markdown, no preamble.
```

---

## 8. Datadog setup

### 8.1 Run command
```
ddtrace-run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 8.2 Required env vars (`backend/.env`)
```
DD_API_KEY=...
DD_SITE=datadoghq.com           # or datadoghq.eu — verify against your key's region
DD_SERVICE=tc-copilot
DD_ENV=development              # 'production' on Fly/Render
DD_LLMOBS_ENABLED=1
DD_LLMOBS_ML_APP=tc-copilot
```

`DD_SITE` is the silent-failure trap from the practice run — if the API key is on the EU site but `DD_SITE` defaults to US, traces vanish with no error.

### 8.3 Span tagging convention
Every `call_claude` invocation passes a `feature_tag` argument. Inside `call_claude`, annotate the active LLMObs span:

```py
from ddtrace.llmobs import LLMObs

LLMObs.annotate(
    metrics={
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
        "input_cost_usd": input_cost,
        "output_cost_usd": output_cost,
        "total_cost_usd": total_cost,
    },
    tags={"feature": feature_tag, "model": model},
)
```

### 8.4 Per-prompt cost calculation
```py
# USD per 1M tokens — verify against the Anthropic pricing page on build day.
MODEL_PRICES = {
    "claude-sonnet-4-20250514": {"input": 3.00, "output": 15.00},
}

def _cost(tokens: int, rate_per_million: float) -> float:
    return tokens * rate_per_million / 1_000_000
```

The LLMObs dashboard's "cost by feature" widget sums `total_cost_usd` grouped by the `feature` tag. Verification gate (Phase 1.2) confirms this widget is non-zero before any feature code is written.

### 8.5 Allowed `feature_tag` values
`pathology`, `symptom-validate`, `symptom-summary`, `trial-finder`, `doctor-questions`. Anything else is a bug.

---

## 9. Design system

Tokens live in `app/globals.css`. The palette is OKLCH; light theme is the default, `[data-theme="dark"]` on `<html>` flips to dark. The `ThemeProvider` in `components/ThemeProvider.tsx` persists the choice in `localStorage` under key `tc-theme`.

### Token philosophy
- **Surfaces**: warm cream `--bg`, white `--surface`, soft `--surface-2`
- **Ink**: near-black `--ink` for text and the primary CTA background
- **Accents**: `--sage` (positive/good), `--clay` (warm accent / cautionary), `--plum` (tertiary)
- **Type**: Instrument Serif for display (`.h-display`, brand wordmark), Geist Sans for body, Geist Mono for `.eyebrow` and numbers
- **Radii**: cards `--r-xl` (24px), buttons **pill** (`999px`), inputs `--r-md` (12px)
- **Shadows**: `--shadow-sm/md/lg` — soft, never glow

### Class vocabulary (the only one the app uses)
- Shell: `.app`, `.page`, `.container`, `.topbar`, `.topbar-left`, `.nav`, `.profile`, `.avatar`
- Brand: `.brand`, `.brand-mark`
- Buttons: `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-sage`, `.btn-sm`
- Type: `.h-display`, `.eyebrow`, `.lede`
- Card / chips: `.card`, `.pill`, `.pill-clay`, `.pill-sage`, `.pill-warn`, `.pill-alert`, `.dot` (+ `.warn`, `.alert`, `.muted`)
- Input: `.input` (also for `textarea.input`)
- Motion: `[data-enter]` for hydrated-card fade-in (320ms)

### Rule
**Do not introduce new colors, new radii, new shadows.** If something looks missing, re-read `app/globals.css`. New components compose existing classes. Inline styles are allowed for one-off layout (margins, grid templates) but never for color, font, or shadow — those come from tokens.

### Copy tone
- "you", never "patient"
- Disclaimers small and muted, never red-boxed
- Section heads are short serif sentences ("Paste your report.", "How are you feeling today?")
- Every page opens with an `.eyebrow` (mono uppercase) above the H1

---

## 10. Environment variables

### Frontend — `.env.local`
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```
Only one variable. The frontend has no sponsor secrets — ever.

### Backend — `backend/.env`
```
# Anthropic
ANTHROPIC_API_KEY=

# ClickHouse Cloud
CLICKHOUSE_HOST=
CLICKHOUSE_USER=
CLICKHOUSE_PASSWORD=
CLICKHOUSE_DATABASE=tc_copilot

# Nimble
NIMBLE_API_KEY=

# Datadog
DD_API_KEY=
DD_SITE=datadoghq.com
DD_SERVICE=tc-copilot
DD_ENV=development
DD_LLMOBS_ENABLED=1
DD_LLMOBS_ML_APP=tc-copilot

# CORS
FRONTEND_ORIGIN=http://localhost:3000
```

Both projects keep a checked-in `.env.example` template.

---

## 11. Build order — DO NOT SKIP PHASE 1

The practice run lost five hours to silently-failing sponsor integrations. The fix: every sponsor gets a smoke-test endpoint that is **visually verified in its sponsor dashboard before any feature code is written**.

### Phase 0 — Joint scaffold (~30 min)
Both engineers, side by side.
1. Frontend scaffold (Haris): `create-next-app`, install deps, drop tokens into `globals.css`, render `TopBar` + sample home page.
2. Backend scaffold (partner): `uv init` under `backend/`, FastAPI hello world, ddtrace init.
3. `.env.local` and `backend/.env`.
4. Push blank build to Vercel and Fly/Render to confirm CI green.

### Phase 1 — Joint integration health checks (~60 min) — DO NOT SKIP
Four endpoints, four dashboard gates.
1. **`GET /health/clickhouse`** → row visible in ClickHouse Cloud SQL console (`SELECT * FROM patient_profiles WHERE patient_id LIKE 'health-check-%'`).
2. **`GET /health/datadog`** → service `tc-copilot` in APM **and** in LLM Observability with prompt + completion text **and** `total_cost_usd` populated.
3. **`GET /health/claude`** → valid JSON parsed; visible in LLMObs.
4. **`GET /health/nimble`** → ≥1 trial result.

**No feature code begins until all four gates pass.**

### Phase 2 — Parallel work split (~4 hrs)

**Haris** — frontend + 3 features + onboarding:
- H1. Onboarding + profile (~30 min)
- H2. Pathology — `/pathology` (~45 min)
- H3. Symptom Tracker — `/symptoms` (~75 min)
- H4. Questions for the doctors — `/questions` (~45 min)
- H5. Home / dashboard polish (~20 min)

**Partner** — Python backend + Trials:
- B1. FastAPI scaffold + CORS + ddtrace (Phase 0, joint)
- B2. `lib/{claude,clickhouse,nimble}.py` wrappers (incl. cost annotation)
- B3. Profile + symptoms endpoints (`/profile`, `/symptoms/seed`, `/symptoms`, `/symptom-log`, `/symptom-validate`, `/symptom-summary`)
- B4. Pathology + doctor-questions endpoints (`/translate-report`, `/doctor-questions*`)
- B5. Clinical Trial Finder — `/trials` page + `POST /find-trials`
- B6. `POST /symptoms/seed-demo-history` so Haris's chart isn't empty in the demo

**Handshakes**
- CORS open → end of Phase 0
- Pydantic shapes pinned in `backend/app/models.py` → start of Phase 2
- `X-Patient-Id` convention → end of Phase 0
- `seed-demo-history` endpoint → by hour 3

Keep `API.md` updated as endpoints land. Both engineers can edit it.

### Phase 3 — Polish + demo (~45 min, joint)
- Verify seeded 14 days produces a meaningful chart
- Re-run all four health endpoints
- Open Datadog LLMObs on a second monitor — judges should see prompts/completions live
- Run the demo script (§13) end to end twice

---

## 12. Key constraints

- No client-side sponsor calls. Ever.
- No PDF parsing. Pathology input is paste-as-text.
- No auth. UUID cookie is patient identity.
- No free-form chat UI. All interactions are structured (sliders, textareas, buttons with explicit submits). Keeps the agent predictable under demo pressure.
- Mock data is fine **only** for the symptom-history seed. Nimble is live; do not mock trials.
- Scope over polish. A working feature with rough UI beats a beautiful feature that crashes.
- Do not introduce new design tokens. Compose existing classes.

---

## 13. Demo script (3–4 min)

1. Open the live Vercel URL. Cookie present → home greets with "Good morning"; primary CTA says "Log today's symptoms".
2. **Symptoms** — 14-day chart, summary card flags one trend in clay. Move two sliders, submit live — new rows write.
3. **Pathology** — paste the sample report, hit translate, plain-English explanation + 4–5 questions render. Point at the muted disclaimer.
4. **Questions** — open `/questions`. The page already shows the report questions tagged `report` (ink pill) **plus** a symptom-derived question tagged `symptom-alert` (clay pill). Add one self-typed. Hit "Summarise into one prep sheet". This is the wow moment.
5. **Trials** — hit search, live Nimble scrape, 3 trial cards render with pills.
6. **Second screen** — switch to Datadog LLM Observability. Every Claude call from the demo is grouped by `feature` tag with prompts, completions, and `total_cost_usd` populated. Show the cost-by-feature widget summing the demo's total spend.

**Opening line:**
> "I have cancer. After every appointment I'd leave with a printout I couldn't understand, a head full of questions I forgot to ask, and no idea if there was a trial I qualified for. I built the tool I wish I had."
