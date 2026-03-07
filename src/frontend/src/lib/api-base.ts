function normalizeApiBaseUrl(rawBaseUrl: string): string {
  const trimmed = rawBaseUrl.trim().replace(/\/$/, "");

  try {
    const url = new URL(trimmed);
    if (url.pathname === "" || url.pathname === "/") {
      url.pathname = "/api";
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    if (!trimmed || trimmed === "/") return "/api";
    return trimmed;
  }
}

export function getApiBaseUrl(): string {
  // Explicit override always wins (any environment).
  const env = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (env) {
    return normalizeApiBaseUrl(env);
  }

  // Dev: frontend dev-server (:3000) is separate from the backend (:8000).
  // NODE_ENV is "development" during `npm run dev` — no .env.local needed.
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:8000/api";
  }

  // Prod (Docker / PyInstaller / OpenShift): the frontend is a static export
  // served by the same FastAPI process, so window.location.origin IS the backend.
  if (typeof window !== "undefined") {
    return normalizeApiBaseUrl(window.location.origin);
  }

  return "http://localhost:8000/api";
}
