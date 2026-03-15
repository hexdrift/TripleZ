import { toast } from "react-toastify";

function sanitizeExcelCell(value: string) {
  const text = String(value ?? "");
  const trimmed = text.trimStart();
  if (!trimmed) return text;
  return /^[=+\-@]/.test(trimmed) ? `'${text}` : text;
}

/** Color schemes per building within a gender section. */
const BUILDING_COLORS = [
  { header: "FF1F4E79", sub: "FF2E75B5", light: "FFD6E4F0" },
  { header: "FF375623", sub: "FF548235", light: "FFD9E8CB" },
  { header: "FF843C0C", sub: "FFC55A11", light: "FFFBE5D6" },
  { header: "FF4A1A6B", sub: "FF7030A0", light: "FFE2D1F0" },
  { header: "FF76231E", sub: "FF953735", light: "FFF2DBDB" },
  { header: "FF1B4D5C", sub: "FF2F8EA8", light: "FFDAEEF3" },
];

const GENDER_COLORS: Record<string, string> = {
  "בנות": "FFC00000",
  "בנים": "FF1F4E79",
};

type RoomEntry = {
  building: string;
  gender: string;
  roomLabel: string;
  occupants: string[];
};

const solidFill = (argb: string) =>
  ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });

const thinBorder = { style: "thin" as const, color: { argb: "FFB0B0B0" } };
const cellBorder = { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder };

/**
 * Export room data as a columnar .xlsx grouped by gender then building.
 * Each gender gets its own table section separated by empty rows.
 */
async function exportColumnar(filename: string, rooms: RoomEntry[]) {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");

  // Group by gender, preserving order
  const genderOrder: string[] = [];
  const byGender = new Map<string, RoomEntry[]>();
  for (const room of rooms) {
    if (!byGender.has(room.gender)) {
      genderOrder.push(room.gender);
      byGender.set(room.gender, []);
    }
    byGender.get(room.gender)!.push(room);
  }

  // Within each gender, group by building preserving order
  function groupByBuilding(entries: RoomEntry[]) {
    const order: string[] = [];
    const map = new Map<string, RoomEntry[]>();
    for (const r of entries) {
      if (!map.has(r.building)) {
        order.push(r.building);
        map.set(r.building, []);
      }
      map.get(r.building)!.push(r);
    }
    return order.map((b) => ({ building: b, rooms: map.get(b)! }));
  }

  let currentRow = 1;

  for (const gender of genderOrder) {
    const genderRooms = byGender.get(gender)!;
    const buildingGroups = groupByBuilding(genderRooms);
    const totalCols = genderRooms.length;

    // Find max occupants in this gender section
    let maxOcc = 0;
    for (const r of genderRooms) {
      if (r.occupants.length > maxOcc) maxOcc = r.occupants.length;
    }

    // ── Row: Gender title (merged across all columns) ──
    const genderTitleRow = currentRow;
    if (totalCols > 1) {
      ws.mergeCells(genderTitleRow, 1, genderTitleRow, totalCols);
    }
    const genderCell = ws.getCell(genderTitleRow, 1);
    genderCell.value = gender;
    const genderColor = GENDER_COLORS[gender] || "FF333333";
    genderCell.fill = solidFill(genderColor);
    genderCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 14 };
    genderCell.alignment = { horizontal: "center", vertical: "middle" };
    genderCell.border = cellBorder;
    for (let c = 2; c <= totalCols; c++) {
      const mc = ws.getCell(genderTitleRow, c);
      mc.fill = solidFill(genderColor);
      mc.border = cellBorder;
    }
    ws.getRow(genderTitleRow).height = 30;

    // ── Row: Building headers (merged per building group) ──
    const buildingRow = currentRow + 1;
    let col = 1;
    let colorIdx = 0;

    // Track building info for room + data rows
    const roomLayout: { room: RoomEntry; col: number; colors: typeof BUILDING_COLORS[0] }[] = [];

    for (const group of buildingGroups) {
      const colors = BUILDING_COLORS[colorIdx % BUILDING_COLORS.length];
      const startCol = col;
      const endCol = col + group.rooms.length - 1;

      // Building header merged
      if (group.rooms.length > 1) {
        ws.mergeCells(buildingRow, startCol, buildingRow, endCol);
      }
      const bCell = ws.getCell(buildingRow, startCol);
      bCell.value = group.building;
      bCell.fill = solidFill(colors.header);
      bCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 12 };
      bCell.alignment = { horizontal: "center", vertical: "middle" };
      bCell.border = cellBorder;
      for (let c = startCol + 1; c <= endCol; c++) {
        const mc = ws.getCell(buildingRow, c);
        mc.fill = solidFill(colors.header);
        mc.border = cellBorder;
      }

      for (const room of group.rooms) {
        roomLayout.push({ room, col, colors });
        col++;
      }
      colorIdx++;
    }
    ws.getRow(buildingRow).height = 26;

    // ── Row: Room headers ──
    const roomHeaderRow = currentRow + 2;
    for (const { room, col: c, colors } of roomLayout) {
      const rCell = ws.getCell(roomHeaderRow, c);
      rCell.value = room.roomLabel;
      rCell.fill = solidFill(colors.sub);
      rCell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      rCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      rCell.border = cellBorder;
    }
    ws.getRow(roomHeaderRow).height = 22;

    // ── Rows: Occupant names ──
    const dataStart = currentRow + 3;
    for (const { room, col: c, colors } of roomLayout) {
      for (let oi = 0; oi < maxOcc; oi++) {
        const cell = ws.getCell(dataStart + oi, c);
        const name = room.occupants[oi] || "";
        cell.value = sanitizeExcelCell(name);
        cell.fill = solidFill(colors.light);
        cell.font = { size: 11, color: { argb: colors.header } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = cellBorder;
      }
    }

    // Move past this section + 2 empty rows before next gender
    currentRow = dataStart + maxOcc + 2;
  }

  // Column widths
  for (let c = 1; c <= ws.columnCount; c++) {
    ws.getColumn(c).width = 22;
  }

  ws.views = [{ rightToLeft: true }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  downloadBlob(blob, `${filename}.xlsx`);
  toast.success(`הקובץ ${filename}.xlsx יוצא בהצלחה`);
}

/**
 * Export data as a styled .xlsx file.
 *
 * When the last element of each row is a `string[]` (occupant names), the
 * export uses a columnar layout grouped by gender then building.
 * Otherwise falls back to a standard row-based table.
 */
export async function exportToExcel(
  filename: string,
  headers: string[],
  rows: (string | string[])[][],
) {
  try {
    const hasOccupants = rows.length > 0 && Array.isArray(rows[0][rows[0].length - 1]);

    if (hasOccupants) {
      // Parse rows: [building, roomNumber, ...info, gender(last fixed), [occupants]]
      // Current call sites pass: [building, roomNumber, dept, gender, [occupants]]
      const columnarRows: RoomEntry[] = rows.map((row) => {
        const occupants = row[row.length - 1] as string[];
        const fixed = row.slice(0, -1) as string[];
        const building = fixed[0] || "";
        const roomNumber = fixed[1] || "";
        const gender = fixed[fixed.length - 1] || "";
        // Build room label from room number + middle info (dept etc, skip building and gender)
        const infoParts = fixed.slice(2, -1).filter((v) => v && v !== "—");
        const label = [`חדר ${roomNumber}`, ...infoParts].filter(Boolean).join(" · ");
        return { building, gender, roomLabel: label, occupants };
      });
      await exportColumnar(filename, columnarRows);
      return;
    }

    // Standard row-based export
    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");

    const headerRow = ws.addRow(headers.map(sanitizeExcelCell));
    const headerFill = solidFill("FF374151");
    const headerFont = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    headerRow.eachCell((cell) => {
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    const rowColors = ["FFFFFFFF", "FFF3F4F6"];
    for (let i = 0; i < rows.length; i++) {
      const dataRow = ws.addRow((rows[i] as string[]).map(sanitizeExcelCell));
      const fill = solidFill(rowColors[i % 2]);
      dataRow.eachCell({ includeEmpty: true }, (cell) => { cell.fill = fill; });
    }

    ws.columns.forEach((column) => {
      let maxLen = 8;
      column.eachCell?.({ includeEmpty: false }, (cell) => {
        const len = String(cell.value ?? "").length;
        if (len > maxLen) maxLen = len;
      });
      column.width = Math.min(maxLen + 4, 40);
    });

    ws.views = [{ rightToLeft: true }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    downloadBlob(blob, `${filename}.xlsx`);
    toast.success(`הקובץ ${filename}.xlsx יוצא בהצלחה`);
  } catch (err) {
    console.error(err);
    toast.error("שגיאה בייצוא לאקסל");
  }
}

/** Trigger a browser download from a Blob. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Download an Excel file from a base64-encoded string (generated server-side). */
export function downloadBase64Excel(base64: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  downloadBlob(blob, `${filename}.xlsx`);
}
