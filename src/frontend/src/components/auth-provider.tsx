"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AuthState, getStoredAuth, setStoredAuth, clearStoredAuth } from "@/lib/auth";
import { login as apiLogin } from "@/lib/api";
import { deptHe } from "@/lib/hebrew";
import { IconLock, IconZzz } from "./icons";

interface AuthContextValue {
  auth: AuthState;
  logout: () => void;
}

const AuthCtx = createContext<AuthContextValue>(null!);

export function useAuth() {
  return useContext(AuthCtx);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    setAuth(getStoredAuth());
    setChecked(true);
  }, []);

  const handleLogin = useCallback((authState: AuthState) => {
    setStoredAuth(authState);
    setAuth(authState);
  }, []);

  const handleLogout = useCallback(() => {
    clearStoredAuth();
    setAuth(null);
  }, []);

  if (!checked) return null;

  if (!auth) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <AuthCtx.Provider value={{ auth, logout: handleLogout }}>
      {children}
    </AuthCtx.Provider>
  );
}

function LoginPage({ onLogin }: { onLogin: (auth: AuthState) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!password.trim()) return;
    setError("");
    setLoading(true);

    try {
      const res = await apiLogin(password);
      if (res.ok && res.role) {
        onLogin({ role: res.role as AuthState["role"], department: res.department ?? null });
      } else {
        setError(res.error || "סיסמה שגויה");
      }
    } catch {
      setError("שגיאת חיבור לשרת");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--surface-1)" }}>
      <div className="surface-card w-full max-w-[380px] p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="h-14 w-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: "var(--accent)", color: "white" }}>
            <IconZzz size={28} />
          </div>
          <h1 className="text-[28px] font-bold" style={{ color: "var(--text-1)" }}>Triple Z</h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-3)" }}>ניהול חדרים ומבנים</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[12px] font-semibold mb-1.5" style={{ color: "var(--text-2)" }}>
              סיסמה
            </label>
            <div className="relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-3)" }}>
                <IconLock size={15} />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(""); }}
                className="control-input pl-10"
                placeholder="הזן סיסמה"
                autoFocus
                autoComplete="current-password"
              />
            </div>
          </div>

          {error ? (
            <p className="text-[12px] px-2 py-1.5 rounded-md text-center" style={{ color: "var(--danger)", background: "var(--danger-dim)" }}>
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {loading ? "מתחבר..." : "כניסה"}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
          <p className="text-[11px] text-center" style={{ color: "var(--text-3)" }}>
            מנהל מערכת או מנהל זירה
          </p>
        </div>
      </div>
    </div>
  );
}

/** Helper to display the current role label in Hebrew. */
export function roleLabelHe(auth: AuthState): string {
  if (auth.role === "admin") return "מנהל מערכת";
  return `מנהל ${deptHe(auth.department || "")}`;
}
