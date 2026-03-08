"use client";

import { Suspense, useEffect, useMemo, useState, useRef, createContext, useContext, useCallback } from "react";
import { Sidebar } from "./sidebar";
import { buildingSummaries, getPersonnel } from "@/lib/api";
import { getApiBaseUrl } from "@/lib/api-base";
import { Room, BuildingSummary, DepartmentSummary, GenderSummary, RankSummary, Personnel, ViewMode } from "@/lib/types";
import { AuthState } from "@/lib/auth";
import { useAuth } from "./auth-provider";
import { IconAlertCircle, IconRefresh } from "./icons";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type ConnectionState = "connecting" | "connected" | "error";

interface AppShellContext {
  rooms: Room[];
  buildings: BuildingSummary[];
  personnel: Personnel[];
  dataVersion: number;
  loading: boolean;
  error: string | null;
  connectionState: ConnectionState;
  lastUpdatedAt: number | null;
  auth: AuthState;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  refreshPersonnel: (force?: boolean) => Promise<void>;
}

const SIDEBAR_COLLAPSED_KEY = "triplez_sidebar_collapsed";
const PERSONNEL_REFRESH_TTL_MS = 30_000;
const PERSONNEL_REFRESH_INTERVAL_MS = 30_000;

const Ctx = createContext<AppShellContext>({
  rooms: [],
  buildings: [],
  personnel: [],
  dataVersion: 0,
  loading: true,
  error: null,
  connectionState: "connecting",
  lastUpdatedAt: null,
  auth: { role: "admin", department: null },
  viewMode: "buildings",
  setViewMode: () => {},
  refreshPersonnel: async () => {},
});

export function useAppData() {
  return useContext(Ctx);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { auth } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [allPersonnel, setAllPersonnel] = useState<Personnel[]>([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("buildings");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const hasReceivedDataRef = useRef(false);
  const lastPersonnelFetchRef = useRef(0);
  const dataVersionRef = useRef(0);
  const connectionStateRef = useRef<ConnectionState>("connecting");

  const buildings = useMemo(() => buildingSummaries(rooms), [rooms]);

  const refreshPersonnel = useCallback(async (force = false) => {
    if (!force && connectionStateRef.current !== "connected") {
      return;
    }

    const now = Date.now();
    if (!force && now - lastPersonnelFetchRef.current < PERSONNEL_REFRESH_TTL_MS) {
      return;
    }
    lastPersonnelFetchRef.current = now;

    try {
      const personnelData = await getPersonnel();
      setAllPersonnel(personnelData);
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err ?? "");
      if (/failed to fetch|networkerror|load failed|לא ניתן להתחבר לשרת ה-API/i.test(errMessage)) {
        return;
      }
      console.warn(`Failed to refresh personnel: ${errMessage}`);
    }
  }, []);

  useEffect(() => {
    dataVersionRef.current = dataVersion;
  }, [dataVersion]);

  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);
  const contextValue = useMemo(
    () => ({ rooms, buildings, personnel: allPersonnel, dataVersion, loading, error, connectionState, lastUpdatedAt, auth, viewMode, setViewMode, refreshPersonnel }),
    [rooms, buildings, allPersonnel, dataVersion, loading, error, connectionState, lastUpdatedAt, auth, viewMode, refreshPersonnel],
  );

  useEffect(() => {
    const storedValue = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if (storedValue === "1") {
      setSidebarCollapsed(true);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  useEffect(() => {
    let mounted = true;
    const base = getApiBaseUrl();
    const connectionHint = `לא ניתן להתחבר לשרת ה-API (${base}).`;
    setConnectionState("connecting");

    const es = new EventSource(`${base}/stream/rooms`, { withCredentials: true });
    esRef.current = es;

    es.onopen = () => {
      if (!mounted) return;
      setConnectionState("connected");
      setError(null);
    };

    es.onmessage = (event) => {
      if (!mounted) return;
      try {
        const payload = JSON.parse(event.data) as { version?: number; rooms?: Room[] } | Room[];
        const nextRooms = Array.isArray(payload) ? payload : payload.rooms || [];
        const nextVersion = Array.isArray(payload) ? dataVersionRef.current : Number(payload.version || 0);
        setRooms(nextRooms);
        setDataVersion(nextVersion);
        setLastUpdatedAt(Date.now());
        hasReceivedDataRef.current = true;
        setConnectionState("connected");
        setLoading(false);
        void refreshPersonnel(true);
      } catch (err) {
        console.error("SSE parse error", err);
      }
    };

    es.onerror = () => {
      if (!mounted) return;
      setConnectionState("error");
      if (!hasReceivedDataRef.current) {
        setError(connectionHint);
      }
      setLoading(false);
    };

    void refreshPersonnel(true);

    const refreshIfVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshPersonnel();
      }
    };

    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);
    const personnelInterval = window.setInterval(() => {
      void refreshPersonnel();
    }, PERSONNEL_REFRESH_INTERVAL_MS);

    return () => {
      mounted = false;
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      window.clearInterval(personnelInterval);
      es.close();
      esRef.current = null;
    };
  }, [refreshPersonnel]);

  if (error && rooms.length === 0 && !loading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
          <Card className="w-full max-w-[460px] overflow-hidden border-border/70 bg-gradient-to-br from-card via-card to-background/80">
          <CardContent className="p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive shadow-[var(--shadow-inset)]" aria-hidden="true">
              <IconAlertCircle size={20} />
            </div>
            <p className="mb-1 text-[20px] font-semibold tracking-[-0.03em] text-foreground">החיבור נכשל</p>
            <p className="mb-6 text-[13px] leading-6 text-muted-foreground">{error}</p>
            <Button onClick={() => window.location.reload()} className="inline-flex items-center gap-2">
              <IconRefresh size={14} />
              נסה שוב
            </Button>
          </CardContent>
        </Card>
        </div>
      </div>
    );
  }

  return (
    <Ctx.Provider value={contextValue}>
      <div className="min-h-screen">
        <Suspense>
          <Sidebar
            buildings={buildings}
            viewMode={viewMode}
            rooms={rooms}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
          />
        </Suspense>
        <main
          className="relative min-h-screen px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10 2xl:px-14"
          style={{ ["--sidebar-w" as string]: sidebarCollapsed ? "5rem" : "18.75rem" }}
        >
          <div className="mx-auto w-full max-w-[112rem]">{children}</div>
        </main>
      </div>
    </Ctx.Provider>
  );
}
