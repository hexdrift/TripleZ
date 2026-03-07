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
  const designatedDepartment = normalizeDepartmentValue(row.designated_department ?? "");
  return {
    building_name: normalizeBuildingValue(row.building_name ?? ""), room_number: Number(row.room_number) || 0,
    number_of_beds: Number(row.number_of_beds) || 0, room_rank: normalizeRankValue(row.room_rank ?? ""),
    gender: normalizeGenderValue(row.gender ?? ""),
    occupant_ids: parseOccupantIds(row.occupant_ids ?? ""),
    ...(designatedDepartment ? { designated_department: designatedDepartment } : {}),
  };
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
