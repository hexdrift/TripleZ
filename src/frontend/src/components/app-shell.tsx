"use client";

import { useEffect, useMemo, useState, useRef, createContext, useContext, useCallback } from "react";
import { Sidebar } from "./sidebar";
import { buildingSummaries, departmentSummaries, genderSummaries, rankSummaries, getPersonnel, getSettings } from "@/lib/api";
import { setHebrewOverrides } from "@/lib/hebrew";
import { getApiBaseUrl } from "@/lib/api-base";
import { Room, BuildingSummary, DepartmentSummary, GenderSummary, RankSummary, Personnel, ViewMode } from "@/lib/types";
import { AuthState } from "@/lib/auth";
import { useAuth } from "./auth-provider";
import { IconAlertCircle, IconRefresh } from "./icons";

export type ConnectionState = "connecting" | "connected" | "error";

interface AppShellContext {
  rooms: Room[];
  buildings: BuildingSummary[];
  personnel: Personnel[];
  loading: boolean;
  error: string | null;
  connectionState: ConnectionState;
  lastUpdatedAt: number | null;
  auth: AuthState;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

const Ctx = createContext<AppShellContext>({
  rooms: [],
  buildings: [],
  personnel: [],
  loading: true,
  error: null,
  connectionState: "connecting",
  lastUpdatedAt: null,
  auth: { role: "admin", department: null },
  viewMode: "buildings",
  setViewMode: () => {},
});

export function useAppData() {
  return useContext(Ctx);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { auth } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [allPersonnel, setAllPersonnel] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>("buildings");
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const hasReceivedDataRef = useRef(false);

  const filteredRooms = useMemo(() => {
    if (auth.role === "admin") return rooms;
    return rooms.filter((r) => r.departments.includes(auth.department!));
  }, [rooms, auth]);

  const buildings = useMemo(() => buildingSummaries(filteredRooms), [filteredRooms]);

  const personnel = useMemo(() => {
    if (auth.role === "admin") return allPersonnel;
    return allPersonnel.filter((p) => p.department === auth.department);
  }, [allPersonnel, auth]);

  const refreshPersonnel = useCallback(async () => {
    try {
      const personnelData = await getPersonnel();
      setAllPersonnel(personnelData);
    } catch (err) {
      console.error("Failed to refresh personnel", err);
    }
  }, []);

  useEffect(() => {
    getSettings()
      .then((s) => setHebrewOverrides(s.hebrew))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let mounted = true;
    const base = getApiBaseUrl();
    setConnectionState("connecting");

    const es = new EventSource(`${base}/stream/rooms`);
    esRef.current = es;

    es.onopen = () => {
      if (!mounted) return;
      setConnectionState("connected");
      setError(null);
    };

    es.onmessage = (event) => {
      if (!mounted) return;
      try {
        const data: Room[] = JSON.parse(event.data);
        setRooms(data);
        setLastUpdatedAt(Date.now());
        hasReceivedDataRef.current = true;
        setConnectionState("connected");
        setLoading(false);
        refreshPersonnel();
      } catch (err) {
        console.error("SSE parse error", err);
      }
    };

    es.onerror = () => {
      if (!mounted) return;
      setConnectionState("error");
      if (!hasReceivedDataRef.current) {
        setError("לא ניתן להתחבר לשרת. ודא ששרת ה-API פועל.");
      }
      setLoading(false);
    };

    refreshPersonnel();

    return () => {
      mounted = false;
      es.close();
      esRef.current = null;
    };
  }, [refreshPersonnel]);

  if (error && rooms.length === 0 && !loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="surface-card w-full max-w-[420px] p-8 text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-xl flex items-center justify-center badge-danger" aria-hidden="true">
            <IconAlertCircle size={20} />
          </div>
          <p className="text-[18px] font-semibold mb-1" style={{ color: "var(--text-1)" }}>החיבור נכשל</p>
          <p className="text-[13px] mb-6" style={{ color: "var(--text-3)" }}>{error}</p>
          <button onClick={() => window.location.reload()} className="btn-primary inline-flex items-center gap-2">
            <IconRefresh size={14} />
            נסה שוב
          </button>
        </div>
      </div>
    );
  }

  return (
    <Ctx.Provider value={{ rooms: filteredRooms, buildings, personnel, loading, error, connectionState, lastUpdatedAt, auth, viewMode, setViewMode }}>
      <div className="min-h-screen">
        <Sidebar buildings={buildings} viewMode={viewMode} rooms={filteredRooms} />
        <main className="mr-[292px] min-h-screen px-10 py-10">
          <div className="mx-auto w-full max-w-[1540px]">{children}</div>
        </main>
      </div>
    </Ctx.Provider>
  );
}
