/**
 * Client-side cookie helpers for the anonymous patient_id.
 * Backend will eventually issue this from /profile, but during the
 * frontend-only mock phase we generate it here.
 */

const COOKIE = "patient_id";

export function getPatientId(): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp("(?:^|; )" + COOKIE + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export function setPatientId(id: string) {
  if (typeof document === "undefined") return;
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${COOKIE}=${encodeURIComponent(id)}; path=/; max-age=${oneYear}; SameSite=Lax`;
}

export function newPatientId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "p-" + Math.random().toString(36).slice(2, 10);
}
