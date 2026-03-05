export const RANK_HE: Record<string, string> = {
  VP: 'סמנכ"ל',
  Director: "מנהל בכיר",
  Manager: "מנהל",
  Junior: "זוטר",
};

export const DEPT_HE: Record<string, string> = {
  Exec: "הנהלה",
  Sales: "מכירות",
  "R&D": 'מו"פ',
  IT: 'מערכות מידע',
  QA: 'בקרת איכות',
  Ops: "תפעול",
};

export const GENDER_HE: Record<string, string> = {
  M: "בנים",
  F: "בנות",
};

export const BUILDING_HE: Record<string, string> = {
  A: "א",
  B: "ב",
  C: "ג",
  D: "ד",
};

let _overrides: {
  ranks?: Record<string, string>;
  departments?: Record<string, string>;
  genders?: Record<string, string>;
  buildings?: Record<string, string>;
} = {};

export function setHebrewOverrides(overrides: typeof _overrides) {
  _overrides = overrides;
}

export function rankHe(v: string) { return _overrides.ranks?.[v] || RANK_HE[v] || v; }
export function deptHe(v: string) { return _overrides.departments?.[v] || DEPT_HE[v] || v; }
export function genderHe(v: string) { return _overrides.genders?.[v] || GENDER_HE[v] || v; }
export function buildingHe(v: string) { return _overrides.buildings?.[v] || BUILDING_HE[v] || v; }
