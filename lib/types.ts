/**
 * Shared types for frontend ↔ FastAPI contracts.
 * Backend Pydantic models in backend/app/models.py must match these.
 */

export type Profile = {
  patient_id: string;
  name?: string;
  age?: number;
  cancer_type: string;
  stage: "I" | "II" | "III";
  location: string;
  created_at: string;
};

export type Symptom = {
  symptom_name: string;
  display_name: string;
  is_default: boolean;
};

export type SymptomScore = {
  symptom_name: string;
  score: number;
};

export type ChartRow = {
  day: string; // YYYY-MM-DD
  [symptom: string]: string | number;
};

export type SummaryResponse = {
  summary: string;
  alerts: string[];
};

export type ValidateResponse = {
  valid: boolean;
  symptom_name?: string;
  display_name?: string;
  message: string;
};

export type TranslateResponse = {
  explanation: string;
  questions: string[];
};

export type PathologyReport = {
  id: string;
  report_text: string;
  explanation: string;
  questions: string[];
  created_at: string; // ISO datetime
};

export type DoctorQuestion = {
  id: string;
  source: "report" | "symptom-alert" | "self";
  text: string;
  added_at: string;
  done: boolean;
};

export type Trial = {
  name: string;
  phase: string;
  location: string;
  summary: string;
  eligibility: string;
  url: string;
};
