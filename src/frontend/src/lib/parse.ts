const ROOM_HEADER_ALIASES: Record<string, string> = {
  building_name: "building_name",
  room_number: "room_number",
  number_of_beds: "number_of_beds",
  room_rank: "room_rank",
  gender: "gender",
  occupant_ids: "occupant_ids",
  designated_department: "designated_department",
  "שם מבנה": "building_name",
  "מספר חדר": "room_number",
  "מספר מיטות": "number_of_beds",
  "דרגת חדר": "room_rank",
  "מגדר": "gender",
  "מזהי דיירים": "occupant_ids",
  "זירות": "designated_department",
  "זירה ייעודית": "designated_department",
  "זירה ייעודית (אופציונלי)": "designated_department",
};

const BUILDING_VALUE_ALIASES: Record<string, string> = {
  A: "א",
  B: "ב",
  C: "ג",
  D: "ד",
  א: "א",
  ב: "ב",
  ג: "ג",
  ד: "ד",
  "מבנה א": "א",
  "מבנה ב": "ב",
  "מבנה ג": "ג",
  "מבנה ד": "ד",
};

const RANK_VALUE_ALIASES: Record<string, string> = {
  VP: 'סמנכ"ל',
  'סמנכ"ל': 'סמנכ"ל',
  'סמנכ״ל': 'סמנכ"ל',
  Director: "מנהל בכיר",
  "מנהל בכיר": "מנהל בכיר",
  Manager: "מנהל",
  "מנהל": "מנהל",
  Junior: "זוטר",
  "זוטר": "זוטר",
};

const GENDER_VALUE_ALIASES: Record<string, string> = {
  M: "בנים",
  F: "בנות",
  MALE: "בנים",
  FEMALE: "בנות",
  "בנים": "בנים",
  "בנות": "בנות",
};

const DEPARTMENT_VALUE_ALIASES: Record<string, string> = {
  Exec: "הנהלה",
  "הנהלה": "הנהלה",
  Sales: "מכירות",
  "מכירות": "מכירות",
  "R&D": 'מו"פ',
  'מו"פ': 'מו"פ',
  'מו״פ': 'מו"פ',
  IT: "מערכות מידע",
  "מערכות מידע": "מערכות מידע",
  QA: "בקרת איכות",
  "בקרת איכות": "בקרת איכות",
  Ops: "תפעול",
  "תפעול": "תפעול",
};

function normalizeRoomHeader(header: string): string {
  const trimmed = header.trim();
  return ROOM_HEADER_ALIASES[trimmed] ?? trimmed;
}

function normalizeBuildingValue(value: string): string {
  const trimmed = value.trim();
  return BUILDING_VALUE_ALIASES[trimmed] ?? trimmed;
}

function normalizeRankValue(value: string): string {
  const trimmed = value.trim();
  return RANK_VALUE_ALIASES[trimmed] ?? trimmed;
}

function normalizeGenderValue(value: string): string {
  const trimmed = value.trim();
  return GENDER_VALUE_ALIASES[trimmed.toUpperCase()] ?? GENDER_VALUE_ALIASES[trimmed] ?? trimmed;
}

function normalizeDepartmentValue(value: string): string {
  const trimmed = value.trim();
  return DEPARTMENT_VALUE_ALIASES[trimmed] ?? trimmed;
}

export function splitCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = false;
      } else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { values.push(current); current = ""; }
      else current += ch;
    }
  }
  values.push(current);
  return values;
}

export function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]).map((h) => normalizeRoomHeader(h));
  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, j) => { row[h] = (values[j] ?? "").trim(); });
    return row;
  });
}

export async function parseExcel(buffer: ArrayBuffer): Promise<Record<string, string>[]> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (raw.length < 2) return [];
  const headers = (raw[0] as unknown[]).map((h) => normalizeRoomHeader(String(h)));
  return raw.slice(1)
    .filter((row) => (row as unknown[]).some((cell) => String(cell).trim()))
    .map((row) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, j) => { obj[h] = String((row as unknown[])[j] ?? "").trim(); });
      return obj;
    });
}

export function parseOccupantIds(value: string): string[] {
  if (!value.trim()) return [];
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    try { const parsed = JSON.parse(trimmed); if (Array.isArray(parsed)) return parsed.map(String); } catch {}
  }
  return trimmed.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
}

export function toRoomPayload(row: Record<string, string>): Record<string, unknown> {
  // The export may contain multiple departments comma-separated (e.g. "הנהלה, מכירות")
  // but designated_department is a single value — use only the first one.
  const rawDept = (row.designated_department ?? "").split(",")[0].trim();
  const designatedDepartment = normalizeDepartmentValue(rawDept);
  return {
    building_name: normalizeBuildingValue(row.building_name ?? ""), room_number: Number(row.room_number) || 0,
    number_of_beds: Number(row.number_of_beds) || 0, room_rank: normalizeRankValue(row.room_rank ?? ""),
    gender: normalizeGenderValue(row.gender ?? ""),
    occupant_ids: parseOccupantIds(row.occupant_ids ?? ""),
    ...(designatedDepartment ? { designated_department: designatedDepartment } : {}),
  };
}

/**
 * Try to parse an Excel buffer as a columnar (visual) export.
 * Returns room records if the file matches the columnar format, or null otherwise.
 *
 * The columnar format has title rows like "בנים · א" followed by room-header
 * rows like "חדר 101" and then occupant-name rows.
 */
export async function parseColumnarExcel(buffer: ArrayBuffer): Promise<Record<string, string>[] | null> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return null;
  const sheet = workbook.Sheets[sheetName];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (raw.length < 3) return null;

  const roomPattern = /^חדר\s+(\d+)/;

  // A title row matches "X · Y" but the NEXT row must contain room headers.
  // This distinguishes "בנים · א" from "חדר 101 · הנהלה".
  function isTitleRow(idx: number): RegExpExecArray | null {
    const cell = String((raw[idx] as unknown[])[0] ?? "").trim();
    const m = /^(.+)\s·\s(.+)$/.exec(cell);
    if (!m) return null;
    // Must NOT start with "חדר" (that's a room header, not a title)
    if (roomPattern.test(cell)) return null;
    // Next row must have at least one room header
    if (idx + 1 >= raw.length) return null;
    const nextRow = raw[idx + 1] as unknown[];
    const hasRoom = nextRow.some((c) => roomPattern.test(String(c ?? "").trim()));
    return hasRoom ? m : null;
  }

  // Detect columnar format
  let foundTitle = false;
  for (let i = 0; i < raw.length; i++) {
    if (isTitleRow(i)) { foundTitle = true; break; }
  }
  if (!foundTitle) return null;

  // Parse blocks
  const results: Record<string, string>[] = [];
  let r = 0;
  while (r < raw.length) {
    const titleMatch = isTitleRow(r);
    if (!titleMatch) { r++; continue; }

    const gender = titleMatch[1];
    const building = titleMatch[2];
    r++; // move to room headers row

    if (r >= raw.length) break;
    const headerRow = raw[r] as unknown[];
    const roomHeaders: { roomNumber: string; dept: string; col: number }[] = [];
    for (let c = 0; c < headerRow.length; c++) {
      const cell = String(headerRow[c] ?? "").trim();
      const rm = roomPattern.exec(cell);
      if (rm) {
        const parts = cell.split(" · ");
        const dept = parts.length > 1 ? parts.slice(1).join(" · ") : "";
        roomHeaders.push({ roomNumber: rm[1], dept, col: c });
      }
    }
    if (roomHeaders.length === 0) { r++; continue; }
    r++; // move to data rows

    // Collect all rows until the next title or two consecutive empty rows.
    const occupantsByCol: string[][] = roomHeaders.map(() => []);
    let lastContentIdx = -1;
    let consecutiveEmpty = 0;
    while (r < raw.length) {
      if (isTitleRow(r)) break;
      const row = raw[r] as unknown[];
      const hasContent = roomHeaders.some((rh) =>
        String(row[rh.col] ?? "").trim() !== "",
      );
      if (!hasContent) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 2) break;
        r++;
        continue;
      }
      consecutiveEmpty = 0;
      lastContentIdx = r;
      for (let i = 0; i < roomHeaders.length; i++) {
        const val = String(row[roomHeaders[i].col] ?? "").trim();
        if (val) occupantsByCol[i].push(val);
      }
      r++;
    }
    // The block's row count = rows from start to last row with actual content.
    // All rooms share this count (the max capacity in the visual export).
    // We can't recover per-room bed counts from the visual format, so use the
    // max occupant count across all rooms as a floor.
    const maxOccupants = Math.max(...occupantsByCol.map((o) => o.length), 1);
    const totalDataRows = maxOccupants;

    // Build room records
    for (let i = 0; i < roomHeaders.length; i++) {
      const rh = roomHeaders[i];
      const ids = occupantsByCol[i].map((entry) => {
        const dashIdx = entry.lastIndexOf(" - ");
        return dashIdx >= 0 ? entry.substring(dashIdx + 3) : entry;
      });
      // Use max of occupant count and totalDataRows for beds
      const beds = Math.max(totalDataRows, occupantsByCol[i].length);
      // The visual export shows all departments (comma-separated) in the header,
      // but designated_department is a single value. Use the first one only if
      // there's exactly one; otherwise leave empty (room serves multiple depts).
      const deptParts = rh.dept ? rh.dept.split(",").map((d) => d.trim()).filter(Boolean) : [];
      const dept = deptParts.length === 1 ? deptParts[0] : "";
      results.push({
        building_name: building,
        room_number: rh.roomNumber,
        number_of_beds: String(beds),
        room_rank: "זוטר",  // Visual format doesn't include rank; default to lowest
        gender: gender,
        occupant_ids: ids.join(","),
        designated_department: dept,
      });
    }
  }

  return results.length > 0 ? results : null;
}

export function parseFile(file: File): Promise<Record<string, string>[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const buffer = e.target?.result;
          if (!(buffer instanceof ArrayBuffer)) { resolve([]); return; }
          resolve(await parseExcel(buffer));
        } catch (err) { reject(err); }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text !== "string") { resolve([]); return; }
      resolve(parseCSV(text));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
