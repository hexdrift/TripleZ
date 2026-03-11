const rankLabels: Record<string, string> = {
  VP: "סמנכ\"ל",
  Director: "מנהל בכיר",
  Manager: "מנהל",
  Junior: "זוטר",
};

const departmentLabels: Record<string, string> = {
  Exec: "הנהלה",
  Sales: "מכירות",
  "R&D": "מו\"פ",
  IT: "מערכות מידע",
  QA: "בקרת איכות",
  Ops: "תפעול",
};

const genderLabels: Record<string, string> = {
  M: "בנים",
  F: "בנות",
  MALE: "בנים",
  FEMALE: "בנות",
};

const buildingLabels: Record<string, string> = {
  A: "א",
  B: "ב",
  C: "ג",
  D: "ד",
};

export function rankHe(v: string) {
  return rankLabels[v] ?? v;
}

export function deptHe(v: string) {
  return departmentLabels[v] ?? v;
}

export function genderHe(v: string) {
  if (!v) return v ?? "";
  return genderLabels[v.toUpperCase()] ?? v;
}

export function buildingHe(v: string) {
  return buildingLabels[v] ?? v;
}
