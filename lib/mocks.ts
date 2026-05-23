/**
 * Mock fixtures used while the FastAPI backend is being built.
 * Every fixture matches a planned API response shape — swap-in is one line per call site.
 */

import type { Profile, Symptom, SummaryResponse, TranslateResponse, DoctorQuestion, ChartRow, Trial } from "./types";

export const MOCK_PROFILE: Profile = {
  patient_id: "demo-patient",
  name: "Alex",
  cancer_type: "Testicular Cancer",
  stage: "II",
  location: "Boston",
  created_at: new Date().toISOString(),
};

export const MOCK_SYMPTOMS: Symptom[] = [
  { symptom_name: "fatigue", display_name: "Fatigue", is_default: true },
  { symptom_name: "nausea", display_name: "Nausea", is_default: true },
  { symptom_name: "neuropathy", display_name: "Neuropathy (Hand/Foot Tingling)", is_default: true },
  { symptom_name: "pain", display_name: "Pain", is_default: true },
  { symptom_name: "tinnitus", display_name: "Ear Ringing (Tinnitus)", is_default: false },
];

/** 14 days of realistic-looking trend data for the chart. */
export const MOCK_CHART: ChartRow[] = (() => {
  const today = new Date();
  const rows: ChartRow[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const day = d.toISOString().slice(0, 10);
    const cycle = (i % 7) / 7; // peaks mid-week
    rows.push({
      day,
      fatigue: clamp(5 + Math.sin(cycle * Math.PI) * 3 + jitter()),
      nausea: clamp(3 + Math.cos(cycle * Math.PI) * 2 + jitter()),
      neuropathy: clamp(2 + (13 - i) * 0.2 + jitter()),
      pain: clamp(4 + Math.sin(cycle * Math.PI * 2) * 1.5 + jitter()),
      tinnitus: clamp(1 + (13 - i) * 0.25 + jitter()),
    });
  }
  return rows;
})();

function clamp(n: number): number {
  return Math.max(1, Math.min(10, Math.round(n)));
}
function jitter(): number {
  return (Math.random() - 0.5) * 0.8;
}

export const MOCK_SUMMARY: SummaryResponse = {
  summary:
    "Fatigue has held in the moderate-to-high range over the past two weeks, with the worst days clustering mid-cycle. Nausea improved by day 10 — likely the new anti-emetic kicking in. Neuropathy and tinnitus have crept up steadily; both are common with cisplatin and worth flagging.",
  alerts: [
    "Neuropathy increased by 3 points — ask about a dose adjustment or neuropathy referral.",
    "Tinnitus rose from 1 to 4 — ask about an audiology baseline.",
  ],
};

export const SAMPLE_REPORT = `SURGICAL PATHOLOGY REPORT

Specimen: Right radical orchiectomy
Clinical history: 32-year-old male with right testicular mass

GROSS DESCRIPTION:
The specimen consists of a right testicle measuring 6.5 x 4.2 x 3.8 cm with attached spermatic cord (8 cm). Sectioning reveals a well-circumscribed tan-white mass measuring 3.2 cm in greatest dimension, confined to the testicular parenchyma. Tunica albuginea intact.

MICROSCOPIC DESCRIPTION:
Sheets of uniform polygonal cells with clear cytoplasm, distinct cell borders, and centrally placed nuclei with prominent nucleoli. Lymphocytic infiltrate present in fibrous septa. No embryonal carcinoma, yolk sac, or teratomatous elements identified.

IMMUNOHISTOCHEMISTRY:
- PLAP: positive
- OCT3/4: positive
- CD30: negative
- AFP: negative

SERUM MARKERS (pre-orchiectomy):
- AFP: 2.1 ng/mL (normal <8.4)
- beta-HCG: 4 mIU/mL (normal <5)
- LDH: 198 U/L (normal 140-280)

DIAGNOSIS:
Right testis: Classical seminoma, 3.2 cm, confined to testis. Spermatic cord margin negative. No lymphovascular invasion identified. Stage pT1.`;

export const MOCK_TRANSLATION: TranslateResponse = {
  explanation: `Your report shows you had surgery to remove your right testicle, and the tumor inside was a **classical seminoma** — the most common and most treatable type of testicular cancer.

The tumor was 3.2 cm and stayed inside the testicle. The doctors checked the edges of the tissue they removed (the "spermatic cord margin") and found no cancer cells there, which means the surgery removed everything they could see. There was no sign of cancer in nearby blood or lymph vessels (no "lymphovascular invasion").

A few terms from the report:
- **PLAP** and **OCT3/4 positive**: these are protein markers that confirm seminoma.
- **AFP normal, beta-HCG normal**: blood-test markers used to track this cancer. Yours were in the normal range before surgery.
- **Stage pT1**: the cancer was contained inside the testicle — the earliest stage.

Seminomas at this stage have a very high cure rate.`,
  questions: [
    "Given the stage pT1 and clear margins, what are my options — surveillance, single-dose carboplatin, or radiation?",
    "How often will I need scans and blood work over the next two years?",
    "What signs of recurrence should I watch for at home?",
    "Should I bank sperm before any further treatment?",
    "Is there anything in this report that affects my fertility long-term?",
  ],
};

export const MOCK_TRIALS: Trial[] = [
  {
    name: "Phase III Trial of Single-Dose Carboplatin vs. Surveillance in Stage I Seminoma",
    phase: "Phase 3",
    location: "Dana-Farber Cancer Institute, Boston, MA",
    summary:
      "This study compares a single dose of carboplatin chemotherapy against active surveillance for men with stage I seminoma after orchiectomy. The goal is to see whether the one-dose treatment reduces the chance of relapse without the long-term side effects of more intensive chemo.",
    eligibility:
      "Men 18-50 with newly diagnosed stage I seminoma, post-orchiectomy, no prior chemo or radiation.",
    url: "https://clinicaltrials.gov/study/NCT04467437",
  },
  {
    name: "Reduced-Dose Cisplatin BEP for Good-Risk Germ Cell Tumors",
    phase: "Phase 2",
    location: "Memorial Sloan Kettering, New York, NY",
    summary:
      "Tests whether lowering the cisplatin dose in standard BEP chemotherapy preserves the cure rate while reducing hearing loss, neuropathy, and kidney effects. Three cycles instead of four are also evaluated for good-risk patients.",
    eligibility:
      "Men with good-risk metastatic germ cell tumor (IGCCCG criteria), no prior systemic therapy.",
    url: "https://clinicaltrials.gov/study/NCT03937843",
  },
  {
    name: "Audiology Monitoring During Platinum-Based Chemotherapy",
    phase: "Observational",
    location: "Multi-site (Boston / NYC / Philadelphia)",
    summary:
      "An observational study tracking hearing changes during and after cisplatin treatment. Participants get free audiograms at set intervals; data feeds into national guidelines for monitoring ototoxicity.",
    eligibility:
      "Anyone scheduled to receive cisplatin-based chemotherapy. No treatment changes — observational only.",
    url: "https://clinicaltrials.gov/study/NCT05421741",
  },
];

export const MOCK_QUESTIONS: DoctorQuestion[] = [
  {
    id: "q1",
    source: "report",
    text: "Given the stage pT1 and clear margins, what are my options — surveillance, single-dose carboplatin, or radiation?",
    added_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    done: false,
  },
  {
    id: "q2",
    source: "report",
    text: "How often will I need scans and blood work over the next two years?",
    added_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    done: false,
  },
  {
    id: "q3",
    source: "symptom-alert",
    text: "Neuropathy has increased by 3 points over the past two weeks — could we discuss a dose adjustment or referral?",
    added_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    done: false,
  },
  {
    id: "q4",
    source: "symptom-alert",
    text: "Tinnitus has risen from 1 to 4 — would an audiology baseline make sense now?",
    added_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    done: false,
  },
  {
    id: "q5",
    source: "self",
    text: "Can I keep running? I've been jogging twice a week and want to know if that's safe during this cycle.",
    added_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    done: false,
  },
];
