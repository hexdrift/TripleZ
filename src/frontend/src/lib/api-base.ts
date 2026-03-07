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
  const env = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (env) {
    return normalizeApiBaseUrl(env);
  }

  if (typeof window !== "undefined") {
    return normalizeApiBaseUrl(window.location.origin);
  }

  return "http://localhost:8000/api";
}
