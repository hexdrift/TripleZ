import { Room, PersonLink, Personnel, AssignResponse, BuildingSummary, DepartmentSummary, GenderSummary, RankSummary } from "./types";
import { getApiBaseUrl } from "./api-base";

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  return res.json();
}

export async function getRooms(): Promise<Room[]> {
  return fetchJSON<Room[]>("/rooms");
}

export async function getLinks(): Promise<PersonLink[]> {
  return fetchJSON<PersonLink[]>("/links");
}

export async function assignPerson(
  personId: string,
  extra?: { rank?: string; department?: string; gender?: string; person_name?: string }
): Promise<AssignResponse> {
  return fetchJSON<AssignResponse>("/assign", {
    method: "POST",
    body: JSON.stringify({ person_id: personId, ...extra }),
  });
}

export async function unassignPerson(personId: string): Promise<{ ok: boolean; detail?: string }> {
  return fetchJSON("/unassign", {
    method: "POST",
    body: JSON.stringify({ person_id: personId }),
  });
}

export async function getPersonRoom(personId: string): Promise<AssignResponse> {
  return fetchJSON<AssignResponse>(`/person/${encodeURIComponent(personId)}`);
}

export async function getPersonnel(): Promise<Personnel[]> {
  return fetchJSON<Personnel[]>("/personnel");
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
  currentOccupantIds: string[],
  newPersonId: string,
): Promise<{ updated: number; added: number; total_rooms: number }> {
  return fetchJSON("/admin/upsert_rooms", {
    method: "POST",
    body: JSON.stringify({
      rooms: [{ building_name: buildingName, room_number: roomNumber, occupant_ids: [...currentOccupantIds, newPersonId] }],
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

export async function swapPeople(personIdA: string, personIdB: string): Promise<{ ok: boolean; detail?: string }> {
  return fetchJSON("/swap", {
    method: "POST",
    body: JSON.stringify({ person_id_a: personIdA, person_id_b: personIdB }),
  });
}

export async function movePerson(personId: string, targetBuilding: string, targetRoomNumber: number): Promise<{ ok: boolean; detail?: string }> {
  return fetchJSON("/move", {
    method: "POST",
    body: JSON.stringify({ person_id: personId, target_building: targetBuilding, target_room_number: targetRoomNumber }),
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

export async function setRoomDepartment(
  buildingName: string,
  roomNumber: number,
  department: string | null,
): Promise<{ ok: boolean; detail?: string }> {
  return fetchJSON("/admin/set_room_department", {
    method: "POST",
    body: JSON.stringify({ building_name: buildingName, room_number: roomNumber, department }),
  });
}

export async function uploadRoomsFile(file: File): Promise<{
  ok: boolean;
  count: number;
  warnings?: RoomLoadWarnings;
}> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${getApiBaseUrl()}/admin/upload_rooms`, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

export async function uploadPersonnelFile(file: File): Promise<{ ok: boolean; count: number }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${getApiBaseUrl()}/admin/upload_personnel`, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

export async function loadPersonnelFromUrl(): Promise<{ ok: boolean; count: number }> {
  return fetchJSON("/admin/load_personnel_from_url", { method: "POST" });
}

export interface AppSettings {
  ranks_high_to_low: string[];
  genders: string[];
  departments: string[];
  buildings: string[];
  personnel_url: string;
  admin_password: string;
  dept_passwords: Record<string, string>;
  hebrew: {
    ranks: Record<string, string>;
    departments: Record<string, string>;
    genders: Record<string, string>;
    buildings: Record<string, string>;
  };
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
        availableBeds: totalBeds - occupiedBeds,
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
        availableBeds: totalBeds - occupiedBeds,
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
        availableBeds: totalBeds - occupiedBeds,
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
        availableBeds: totalBeds - occupiedBeds,
        occupancyRate: totalBeds > 0 ? occupiedBeds / totalBeds : 0,
        departments: [...new Set(bRooms.flatMap((r) => r.departments))].sort(),
        ranks: [...new Set(bRooms.map((r) => r.room_rank))].sort(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
