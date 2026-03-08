import { Room, Personnel, DepartmentSummary } from "./types";

/**
 * Check if a room is visible to a department manager.
 * Visible if: room has at least one occupant from dept, OR room is empty + designated to dept.
 */
export function isRoomVisibleToManager(
  room: Room,
  dept: string,
  personnel: Personnel[],
): boolean {
  if (room.occupant_ids.length === 0) {
    return room.designated_department === dept;
  }
  const personnelMap = new Map(personnel.map((p) => [p.person_id, p]));
  return room.occupant_ids.some((id) => {
    const person = personnelMap.get(id);
    return person?.department === dept;
  });
}

/**
 * Batch-optimized version that accepts a pre-built personnel map.
 */
export function isRoomVisibleToManagerWithMap(
  room: Room,
  dept: string,
  personnelMap: Map<string, Personnel>,
): boolean {
  if (room.occupant_ids.length === 0) {
    return room.designated_department === dept;
  }
  return room.occupant_ids.some((id) => {
    const person = personnelMap.get(id);
    return person?.department === dept;
  });
}

/**
 * Check if a manager can assign people to empty beds in this room.
 * Requires BOTH:
 * 1. All current occupants are from the manager's department (single-dept)
 * 2. Room is mostly filled: occupant_count >= ceil(number_of_beds * 2/3)
 *
 * Empty rooms designated to dept are NOT assignable by managers (admin-only).
 */
export function isRoomAssignableByManager(
  room: Room,
  dept: string,
  personnelMap: Map<string, Personnel>,
): boolean {
  if (room.occupant_ids.length === 0) return false;
  if (room.available_beds <= 0) return false;

  const threshold = Math.ceil(room.number_of_beds * 2 / 3);
  if (room.occupant_count < threshold) return false;

  return room.occupant_ids.every((id) => {
    const person = personnelMap.get(id);
    return person?.department === dept;
  });
}

/**
 * Check if a room is the highest rank (admin-only management).
 */
export function isHighestRankRoom(room: Room, highestRank: string | null): boolean {
  if (!highestRank) return false;
  return room.room_rank === highestRank;
}

/**
 * Check if a room has occupants from more than one department.
 */
export function isMixedRoom(room: Room, personnelMap: Map<string, Personnel>): boolean {
  const depts = new Set<string>();
  for (const id of room.occupant_ids) {
    const person = personnelMap.get(id);
    if (person?.department) depts.add(person.department);
    if (depts.size > 1) return true;
  }
  return false;
}

/**
 * Get the department of a person by ID.
 */
export function getOccupantDepartment(
  personId: string,
  personnelMap: Map<string, Personnel>,
): string | null {
  return personnelMap.get(personId)?.department ?? null;
}

/**
 * Count beds in a room that belong to a specific department.
 * - deptOccupied: occupants from this department
 * - deptAvailable: empty beds only if room is assignable (single-dept + mostly filled)
 * - deptTotal: deptOccupied + deptAvailable
 */
export function deptBedCounts(
  room: Room,
  dept: string,
  personnelMap: Map<string, Personnel>,
): { deptOccupied: number; deptAvailable: number; deptTotal: number } {
  const deptOccupied = room.occupant_ids.filter((id) => personnelMap.get(id)?.department === dept).length;
  const assignable = isRoomAssignableByManager(room, dept, personnelMap);
  const deptAvailable = assignable ? room.available_beds : 0;
  return { deptOccupied, deptAvailable, deptTotal: deptOccupied + deptAvailable };
}

/**
 * Admin department summaries: count beds by actual occupant department.
 * - Occupied beds attributed to each occupant's department
 * - Available beds in single-dept rooms go to that department
 * - Available beds in mixed rooms go to "ללא שיוך"
 * - Empty rooms: beds go to designated_department or "ללא שיוך"
 */
export function adminDeptSummaries(
  rooms: Room[],
  personnelMap: Map<string, Personnel>,
): DepartmentSummary[] {
  const stats = new Map<string, { occupied: number; available: number; rooms: Set<string>; buildings: Set<string> }>();

  function getOrCreate(dept: string) {
    let s = stats.get(dept);
    if (!s) {
      s = { occupied: 0, available: 0, rooms: new Set(), buildings: new Set() };
      stats.set(dept, s);
    }
    return s;
  }

  for (const room of rooms) {
    const roomKey = `${room.building_name}-${room.room_number}`;

    // Count occupied beds by occupant department
    const occupantDepts = new Map<string, number>();
    for (const id of room.occupant_ids) {
      const dept = personnelMap.get(id)?.department;
      if (dept) occupantDepts.set(dept, (occupantDepts.get(dept) || 0) + 1);
    }

    for (const [dept, count] of occupantDepts) {
      const s = getOrCreate(dept);
      s.occupied += count;
      s.rooms.add(roomKey);
      s.buildings.add(room.building_name);
    }

    // Distribute available beds
    if (room.available_beds > 0) {
      const uniqueDepts = [...occupantDepts.keys()];
      if (uniqueDepts.length === 1) {
        // Single-dept room → available beds go to that dept
        getOrCreate(uniqueDepts[0]).available += room.available_beds;
      } else if (uniqueDepts.length > 1) {
        // Mixed room → available beds go to "ללא שיוך"
        const s = getOrCreate("ללא שיוך");
        s.available += room.available_beds;
        s.rooms.add(roomKey);
        s.buildings.add(room.building_name);
      } else {
        // Empty room → designated_department or "ללא שיוך"
        const target = room.designated_department || "ללא שיוך";
        const s = getOrCreate(target);
        s.available += room.available_beds;
        s.rooms.add(roomKey);
        s.buildings.add(room.building_name);
      }
    }
  }

  return Array.from(stats.entries())
    .map(([name, s]) => ({
      name,
      totalRooms: s.rooms.size,
      totalBeds: s.occupied + s.available,
      occupiedBeds: s.occupied,
      availableBeds: s.available,
      occupancyRate: (s.occupied + s.available) > 0 ? s.occupied / (s.occupied + s.available) : 0,
      buildings: [...s.buildings].sort(),
    }))
    .sort((a, b) => {
      if (a.name === "ללא שיוך") return 1;
      if (b.name === "ללא שיוך") return -1;
      return a.name.localeCompare(b.name);
    });
}
