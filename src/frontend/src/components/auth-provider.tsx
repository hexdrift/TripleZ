"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AuthState, getStoredAuth, setStoredAuth, clearStoredAuth } from "@/lib/auth";
import { getAuthContext, getCurrentAuth, login as apiLogin, logout as apiLogout } from "@/lib/api";
import { toast } from "react-toastify";
import { deptHe } from "@/lib/hebrew";
import { IconLock, IconZzz } from "./icons";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    let active = true;

    const hideSplash = () => {
      const splash = document.getElementById("app-splash");
      if (splash) {
        splash.classList.add("hide");
        setTimeout(() => { splash.style.display = "none"; }, 300);
      }
    };

    void getCurrentAuth()
      .then((session) => {
        if (!active) return;
        if (session.ok && session.role) {
          const nextAuth = {
            role: session.role as AuthState["role"],
            department: session.department ?? null,
          };
          setStoredAuth(nextAuth);
          setAuth(nextAuth);
          return;
        }

        if (getStoredAuth()) {
          clearStoredAuth();
        }
        setAuth(null);
      })
      .catch(() => {
        if (!active) return;
        if (getStoredAuth()) {
          clearStoredAuth();
        }
        setAuth(null);
      })
      .finally(() => {
        if (!active) return;
        setChecked(true);
        hideSplash();
      });

    const handleAuthExpired = () => {
      clearStoredAuth();
      setAuth(null);
      toast.info("החיבור פג. יש להתחבר מחדש.");
    };

    window.addEventListener("triplez-auth-expired", handleAuthExpired);

    return () => {
      active = false;
      window.removeEventListener("triplez-auth-expired", handleAuthExpired);
    };
  }, []);

  useEffect(() => {
    if (!checked || !auth || auth.role !== "manager" || !auth.department) {
      return;
    }

    let active = true;
    getAuthContext()
      .then((context) => {
        if (!active) return;
        if (!context.departments.includes(auth.department!)) {
          clearStoredAuth();
          setAuth(null);
          toast.info("זירת הניהול הוסרה מהמערכת. יש להתחבר מחדש.");
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [auth, checked]);

  const handleLogin = useCallback((authState: AuthState) => {
    setStoredAuth(authState);
    setAuth(authState);
  }, []);

  const handleLogout = useCallback(() => {
    void apiLogout().catch(() => undefined).finally(() => {
      clearStoredAuth();
      setAuth(null);
      toast.info("התנתקת מהמערכת");
    });
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
      setError("שגיאת חיבור לשרת. ודא שהשרת פעיל ונגיש.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="flex min-h-[calc(100vh-3rem)] items-center justify-center">
        <Card className="page-hero w-full max-w-[420px] overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-background/80">
        <CardHeader className="flex flex-col items-center pb-0">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[22px] border border-primary/15 bg-primary text-primary-foreground shadow-[var(--shadow-card)]">
            <IconZzz size={28} />
          </div>
          <CardTitle className="text-[30px] font-bold tracking-[-0.04em] text-foreground">Triple Z</CardTitle>
          <CardDescription className="mt-2 text-[13px] leading-6">ניהול חדרים, מבנים ושיבוצים</CardDescription>
        </CardHeader>

        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label className="text-[12px] font-semibold mb-1.5 text-muted-foreground">
                סיסמה
              </Label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <IconLock size={15} />
                </div>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(""); }}
                  className="h-11 pl-11"
                  placeholder="הזן סיסמה"
                  autoFocus
                  autoComplete="current-password"
                />
              </div>
            </div>

            {error ? (
              <p className="text-[12px] px-2 py-1.5 rounded-md text-center text-destructive bg-destructive/10 border border-destructive/20">
                {error}
              </p>
            ) : null}

            <Button
              type="submit"
              disabled={loading || !password.trim()}
              className="flex w-full items-center justify-center gap-2 h-11"
            >
              {loading ? "מתחבר..." : "כניסה"}
            </Button>
          </form>

          <div className="mt-6 border-t border-border/70 pt-4">
            <p className="text-center text-[11px] text-muted-foreground">
              מנהל מערכת או מנהל זירה
            </p>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

/** Helper to display the current role label in Hebrew. */
export function roleLabelHe(auth: AuthState): string {
  if (auth.role === "admin") return "מנהל מערכת";
  const departmentLabel = deptHe(auth.department || "").trim();
  return departmentLabel ? `מנהל זירת: ${departmentLabel}` : "מנהל זירה";
}
