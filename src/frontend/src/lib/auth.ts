export type Role = "admin" | "manager";

export interface AuthState {
  role: Role;
  department: string | null;
}

const STORAGE_KEY = "triplez_auth";

export function getStoredAuth(): AuthState | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.role === "admin" || parsed.role === "manager") return parsed;
  } catch {
    // ignore
  }
  return null;
}

export function setStoredAuth(auth: AuthState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(auth));
}

export function clearStoredAuth(): void {
  localStorage.removeItem(STORAGE_KEY);
}
