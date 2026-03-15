import { Room, Personnel, BuildingSummary, DepartmentSummary, GenderSummary, RankSummary } from "./types";
import { getApiBaseUrl } from "./api-base";

/** Max characters for user-facing error messages. */
const MAX_ERROR_LENGTH = 120;

/** Common Pydantic / Python error patterns → Hebrew translations. */
const ENGLISH_ERROR_MAP: [RegExp, string][] = [
  [/^not found$/i, "לא נמצא"],
  [/^field required$/i, "שדה חובה חסר"],
  [/^internal server error$/i, "שגיאת שרת"],
  [/value is not a valid integer/i, "הערך חייב להיות מספר שלם"],
  [/value is not a valid float/i, "הערך חייב להיות מספר"],
  [/value is not a valid string/i, "הערך חייב להיות טקסט"],
  [/input should be a valid integer/i, "הערך חייב להיות מספר שלם"],
  [/input should be a valid string/i, "הערך חייב להיות טקסט"],
  [/input should be a valid number/i, "הערך חייב להיות מספר"],
  [/none is not an allowed value/i, "חסר ערך חובה"],
  [/value is not none/i, "הערך אינו תקין"],
  [/string does not match regex/i, "פורמט לא תקין"],
  [/ensure this value has at most/i, "הערך ארוך מדי"],
  [/ensure this value has at least/i, "הערך קצר מדי"],
  [/ensure this value is greater than/i, "הערך קטן מדי"],
  [/ensure this value is less than/i, "הערך גדול מדי"],
  [/extra inputs are not permitted/i, "שדות לא מזוהים בבקשה"],
  [/missing$/i, "שדה חובה חסר"],
  [/permission denied/i, "אין הרשאה"],
  [/unauthorized/i, "נדרשת התחברות"],
  [/forbidden/i, "אין הרשאה"],
  [/request entity too large/i, "הקובץ גדול מדי"],
  [/unsupported media type/i, "סוג קובץ לא נתמך"],
];

function truncateMessage(msg: string): string {
  if (msg.length <= MAX_ERROR_LENGTH) return msg;
  return msg.slice(0, MAX_ERROR_LENGTH - 1) + "…";
}

/** True if the string contains at least one Hebrew character. */
function hasHebrew(s: string): boolean {
  return /[\u0590-\u05FF]/.test(s);
}

function normalizeMessage(message: string): string {
  if (!message) return "שגיאת שרת";
  const trimmed = message.trim();
  if (!trimmed) return "שגיאת שרת";

  // Try known English patterns
  for (const [pattern, hebrew] of ENGLISH_ERROR_MAP) {
    if (pattern.test(trimmed)) return hebrew;
  }

  // If no Hebrew at all, it's a raw English exception → generic message
  if (!hasHebrew(trimmed)) return "שגיאה בעיבוד הבקשה";

  return truncateMessage(trimmed);
}

function parseApiError(body: string): string {
  if (!body) return "שגיאת שרת";

  try {
    const parsed = JSON.parse(body) as {
      detail?: unknown;
      message?: unknown;
    };
    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return normalizeMessage(parsed.detail);
    }
    if (Array.isArray(parsed.detail)) {
      const messages = parsed.detail
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object" && "msg" in item) {
            const msg = (item as { msg?: unknown }).msg;
            if (typeof msg === "string") return msg;
          }
          return "";
        })
        .filter(Boolean)
        .map(normalizeMessage);
      if (messages.length > 0) {
        const joined = [...new Set(messages)].join(" · ");
        return truncateMessage(joined);
      }
    }
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return normalizeMessage(parsed.message);
    }
  } catch {
    // ignore JSON parse failures and fall back to raw text
  }

  return normalizeMessage(body);
}

function parseNetworkError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "לא ניתן להתחבר לשרת ה-API";
  }
  return message || "שגיאת רשת";
}

async function fetchJSON<T>(path: string, init?: RequestInit, options?: { suppressAuthEvent?: boolean }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (error) {
    throw new Error(parseNetworkError(error));
  }

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401 && !options?.suppressAuthEvent && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("triplez-auth-expired"));
    }
    throw new Error(parseApiError(body));
  }

  return res.json();
}

export async function unassignPerson(personId: string, expectedVersion?: number): Promise<{ ok: boolean; detail?: string }> {
  return fetchJSON("/unassign", {
    method: "POST",
    body: JSON.stringify({ person_id: personId, ...(expectedVersion !== undefined ? { expected_version: expectedVersion } : {}) }),
  });
}

export async function getPersonnel(): Promise<Personnel[]> {
  return fetchJSON<Personnel[]>("/personnel");
}

export async function createPersonnel(person: {
  person_id: string;
  full_name: string;
  department: string;
  gender: string;
  rank: string;
}): Promise<{ ok: boolean; detail?: string }> {
  return fetchJSON("/admin/create_personnel", {
    method: "POST",
    body: JSON.stringify(person),
  });
}

export type RoomLoadWarnings = {
  unknown_personnel: { person_id: string; building_name: string; room_number: string }[];
  message: string;
  excel_base64: string;
};

export async function loadRooms(rooms: Record<string, unknown>[]): Promise<{
  ok: boolean;
  detail?: string;
  warnings?: RoomLoadWarnings;
}> {
  return fetchJSON("/admin/load_rooms", { method: "POST", body: JSON.stringify({ rooms }) });
}

export async function assignPersonToRoom(
  buildingName: string,
  roomNumber: number,
  newPersonId: string,
  expectedVersion?: number,
): Promise<{ ok: boolean; detail?: string }> {
  return fetchJSON("/assign-to-room", {
    method: "POST",
    body: JSON.stringify({
      person_id: newPersonId,
      building_name: buildingName,
      room_number: roomNumber,
      ...(expectedVersion !== undefined ? { expected_version: expectedVersion } : {}),
    }),
  });
}

export async function createRoom(room: {
  building_name: string;
  room_number: number;
  number_of_beds: number;
  room_rank: string;
  gender: string;
}): Promise<{ updated: number; added: number; total_rooms: number }> {
  return fetchJSON("/admin/upsert_rooms", {
    method: "POST",
    body: JSON.stringify({ rooms: [{ ...room, occupant_ids: [] }] }),
  });
}

export async function updateRoomMetadata(
  room: {
    building_name: string;
    room_number: number;
    number_of_beds?: number;
    room_rank?: string;
    gender?: string;
    designated_department?: string | null;
  },
  expectedVersion?: number,
): Promise<{ updated: number; added: number; total_rooms: number }> {
  return fetchJSON("/admin/upsert_rooms", {
    method: "POST",
    body: JSON.stringify({
      rooms: [room],
      ...(expectedVersion !== undefined ? { expected_version: expectedVersion } : {}),
    }),
  });
}

export async function login(password: string): Promise<{
  ok: boolean;
  role?: string;
  department?: string | null;
  error?: string;
}> {
  return fetchJSON("/auth/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function getCurrentAuth(): Promise<{
  ok: boolean;
  role?: string;
  department?: string | null;
}> {
  return fetchJSON("/auth/me", undefined, { suppressAuthEvent: true });
}

export async function logout(): Promise<{ ok: boolean }> {
  return fetchJSON("/auth/logout", { method: "POST" });
}

export async function swapPeople(personIdA: string, personIdB: string, expectedVersion?: number): Promise<{ ok: boolean; detail?: string }> {
  return fetchJSON("/swap", {
    method: "POST",
    body: JSON.stringify({
      person_id_a: personIdA,
      person_id_b: personIdB,
      ...(expectedVersion !== undefined ? { expected_version: expectedVersion } : {}),
    }),
  });
}

export async function movePerson(personId: string, targetBuilding: string, targetRoomNumber: number, expectedVersion?: number): Promise<{ ok: boolean; detail?: string }> {
  return fetchJSON("/move", {
    method: "POST",
    body: JSON.stringify({
      person_id: personId,
      target_building: targetBuilding,
      target_room_number: targetRoomNumber,
      ...(expectedVersion !== undefined ? { expected_version: expectedVersion } : {}),
    }),
  });
}

export async function getSettings(): Promise<AppSettings> {
  return fetchJSON<AppSettings>("/admin/settings");
}

export async function updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
  return fetchJSON<AppSettings>("/admin/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export interface SettingsImpact {
  has_impact: boolean;
  details: string[];
  affected_personnel: Record<string, unknown>[];
  affected_rooms: Record<string, unknown>[];
}

export async function checkSettingsImpact(settings: Partial<AppSettings>): Promise<SettingsImpact> {
  return fetchJSON<SettingsImpact>("/admin/settings/check-impact", {
    method: "POST",
    body: JSON.stringify(settings),
  });
}

export interface SetupRoom {
  building_name: string;
  room_number: number;
  number_of_beds: number;
  room_rank: string;
  gender: string;
  designated_department?: string;
  occupant_ids: string[];
}

export interface SetupPackage {
  version: number;
  exported_at: string;
  settings: AppSettings;
}

export interface IntegrityReport {
  has_changes: boolean;
  removed_personnel_count: number;
  removed_room_count: number;
  cleared_room_designations_count: number;
  removed_unknown_occupants_count: number;
  removed_incompatible_occupants_count: number;
  removed_duplicate_assignments_count: number;
  trimmed_over_capacity_count: number;
  messages: string[];
  message: string;
}

export interface AutoAssignResult {
  ok: boolean;
  assigned_count: number;
  already_assigned_count: number;
  failed_count: number;
  assigned: Array<{
    person_id: string;
    full_name: string;
    department: string;
    gender: string;
    rank: string;
    building_name: string;
    room_number: number;
    room_rank_used: string;
  }>;
  already_assigned: Array<{
    person_id: string;
    full_name: string;
    building_name: string;
    room_number: number;
    room_rank_used: string;
  }>;
  failed: Array<{
    person_id: string;
    full_name: string;
    department: string;
    gender: string;
    rank: string;
    error_code: string;
    error_message: string;
  }>;
  message: string;
}

export async function getSetupPackage(): Promise<SetupPackage> {
  return fetchJSON<SetupPackage>("/admin/setup-package");
}

export async function importSetupPackage(setupPackage: SetupPackage): Promise<{
  ok: boolean;
  settings: AppSettings;
  integrity_report?: IntegrityReport;
}> {
  return fetchJSON("/admin/setup-package", {
    method: "POST",
    body: JSON.stringify(setupPackage),
  });
}

export async function resetData(): Promise<{ ok: boolean }> {
  return fetchJSON("/admin/reset-data", { method: "POST" });
}

export async function resetAll(): Promise<{ ok: boolean }> {
  return fetchJSON("/admin/reset-all", { method: "POST" });
}

export async function deleteRoom(buildingName: string, roomNumber: number): Promise<{ ok: boolean }> {
  return fetchJSON(`/admin/room/${encodeURIComponent(buildingName)}/${roomNumber}`, { method: "DELETE" });
}

export async function deletePerson(personId: string): Promise<{ ok: boolean }> {
  return fetchJSON(`/admin/person/${encodeURIComponent(personId)}`, { method: "DELETE" });
}

export async function releaseSavedAssignment(personId: string): Promise<{ ok: boolean; detail?: string }> {
  return fetchJSON(`/admin/saved-assignment/${encodeURIComponent(personId)}`, { method: "DELETE" });
}

export async function setRoomDepartment(
  buildingName: string,
  roomNumber: number,
  department: string | null,
  expectedVersion?: number,
): Promise<{ ok: boolean; detail?: string }> {
  return fetchJSON("/admin/set_room_department", {
    method: "POST",
    body: JSON.stringify({
      building_name: buildingName,
      room_number: roomNumber,
      department,
      ...(expectedVersion !== undefined ? { expected_version: expectedVersion } : {}),
    }),
  });
}

export interface AutoAssignFilters {
  department?: string | null;
  gender?: string | null;
  rank?: string | null;
  person_ids?: string[] | null;
  expectedVersion?: number;
}

export async function autoAssignUnassigned(filters: AutoAssignFilters = {}): Promise<AutoAssignResult> {
  const body: Record<string, unknown> = {};
  if (filters.department) body.department = filters.department;
  if (filters.gender) body.gender = filters.gender;
  if (filters.rank) body.rank = filters.rank;
  if (filters.person_ids?.length) body.person_ids = filters.person_ids;
  if (filters.expectedVersion !== undefined) body.expected_version = filters.expectedVersion;
  return fetchJSON<AutoAssignResult>("/admin/auto_assign", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function uploadPersonnelFile(file: File): Promise<{ ok: boolean; count: number; integrity_report?: IntegrityReport }> {
  const form = new FormData();
  form.append("file", file);
  let res: Response;
  try {
    res = await fetch(`${getApiBaseUrl()}/admin/upload_personnel`, {
      method: "POST",
      body: form,
      credentials: "include",
    });
  } catch (error) {
    throw new Error(parseNetworkError(error));
  }
  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("triplez-auth-expired"));
    }
    throw new Error(parseApiError(body));
  }
  return res.json();
}

export interface AppSettings {
  ranks_high_to_low: string[];
  genders: string[];
  departments: string[];
  buildings: string[];
  personnel_url: string;
  api_key: string;
  personnel_sync_interval_seconds: number;
  personnel_sync_paused: boolean;
  auto_assign_policy: "department_first" | "fill_first";
  bed_reservation_policy: "reserve" | "best_effort";
  admin_password: string;
  dept_passwords: Record<string, string>;
  integrity_report?: IntegrityReport;
  sync_status?: PersonnelSyncStatus;
}

export async function getAuthContext(): Promise<{ departments: string[]; personnel_url: string; ranks_high_to_low: string[]; genders: string[] }> {
  return fetchJSON("/auth/context");
}

export interface PersonnelSyncStatus {
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_error: string;
  last_count: number;
  last_changed: boolean;
  last_trigger: string;
  configured: boolean;
  paused: boolean;
  interval_seconds: number;
}

export interface AuditLogEntry {
  event_id: string;
  created_at: string;
  actor_role: string;
  actor_department: string;
  action: string;
  entity_type: string;
  entity_id: string;
  message: string;
  details: Record<string, unknown>;
}

export async function getPersonnelSyncStatus(): Promise<PersonnelSyncStatus> {
  return fetchJSON("/admin/personnel-sync-status");
}

export async function runPersonnelSyncNow(): Promise<{
  ok: boolean;
  count: number;
  changed: boolean;
  integrity_report?: IntegrityReport;
  sync_status: PersonnelSyncStatus;
}> {
  return fetchJSON("/admin/personnel-sync/run-now", { method: "POST" });
}

export async function getAuditLog(limit = 50): Promise<{ items: AuditLogEntry[] }> {
  return fetchJSON(`/admin/audit-log?limit=${limit}`);
}

export async function clearAuditLog(): Promise<{ ok: boolean }> {
  return fetchJSON("/admin/audit-log", { method: "DELETE" });
}

export async function deleteAuditEntry(eventId: string): Promise<{ ok: boolean }> {
  return fetchJSON(`/admin/audit-log/${encodeURIComponent(eventId)}`, { method: "DELETE" });
}

export function departmentSummaries(rooms: Room[]): DepartmentSummary[] {
  const map = new Map<string, Room[]>();
  for (const r of rooms) {
    for (const dept of r.departments) {
      const list = map.get(dept) || [];
      list.push(r);
      map.set(dept, list);
    }
  }

  return Array.from(map.entries())
    .map(([name, dRooms]) => {
      const totalBeds = dRooms.reduce((s, r) => s + r.number_of_beds, 0);
      const occupiedBeds = dRooms.reduce((s, r) => s + r.occupant_count, 0);
      return {
        name,
        totalRooms: dRooms.length,
        totalBeds,
        occupiedBeds,
        availableBeds: dRooms.reduce((s, r) => s + r.available_beds, 0),
        occupancyRate: totalBeds > 0 ? occupiedBeds / totalBeds : 0,
        buildings: [...new Set(dRooms.map((r) => r.building_name))].sort(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function genderSummaries(rooms: Room[]): GenderSummary[] {
  const map = new Map<string, Room[]>();
  for (const r of rooms) {
    const list = map.get(r.gender) || [];
    list.push(r);
    map.set(r.gender, list);
  }

  return Array.from(map.entries())
    .map(([name, gRooms]) => {
      const totalBeds = gRooms.reduce((s, r) => s + r.number_of_beds, 0);
      const occupiedBeds = gRooms.reduce((s, r) => s + r.occupant_count, 0);
      return {
        name,
        totalRooms: gRooms.length,
        totalBeds,
        occupiedBeds,
        availableBeds: gRooms.reduce((s, r) => s + r.available_beds, 0),
        occupancyRate: totalBeds > 0 ? occupiedBeds / totalBeds : 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function rankSummaries(rooms: Room[]): RankSummary[] {
  const map = new Map<string, Room[]>();
  for (const r of rooms) {
    const list = map.get(r.room_rank) || [];
    list.push(r);
    map.set(r.room_rank, list);
  }

  return Array.from(map.entries())
    .map(([name, rRooms]) => {
      const totalBeds = rRooms.reduce((s, r) => s + r.number_of_beds, 0);
      const occupiedBeds = rRooms.reduce((s, r) => s + r.occupant_count, 0);
      return {
        name,
        totalRooms: rRooms.length,
        totalBeds,
        occupiedBeds,
        availableBeds: rRooms.reduce((s, r) => s + r.available_beds, 0),
        occupancyRate: totalBeds > 0 ? occupiedBeds / totalBeds : 0,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildingSummaries(rooms: Room[]): BuildingSummary[] {
  const map = new Map<string, Room[]>();
  for (const r of rooms) {
    const list = map.get(r.building_name) || [];
    list.push(r);
    map.set(r.building_name, list);
  }

  return Array.from(map.entries())
    .map(([name, bRooms]) => {
      const totalBeds = bRooms.reduce((s, r) => s + r.number_of_beds, 0);
      const occupiedBeds = bRooms.reduce((s, r) => s + r.occupant_count, 0);
      return {
        name,
        totalRooms: bRooms.length,
        totalBeds,
        occupiedBeds,
        availableBeds: bRooms.reduce((s, r) => s + r.available_beds, 0),
        occupancyRate: totalBeds > 0 ? occupiedBeds / totalBeds : 0,
        departments: [...new Set(bRooms.flatMap((r) => r.departments))].sort(),
        ranks: [...new Set(bRooms.map((r) => r.room_rank))].sort(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
