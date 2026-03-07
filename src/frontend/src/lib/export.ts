import { toast } from "react-toastify";

function sanitizeExcelCell(value: string) {
  const text = String(value ?? "");
  const trimmed = text.trimStart();
  if (!trimmed) return text;
  return /^[=+\-@]/.test(trimmed) ? `'${text}` : text;
}

/** Export data as a real .xlsx file. */
export async function exportToExcel(filename: string, headers: string[], rows: string[][]) {
  try {
    const XLSX = await import("xlsx");
    const data = [
      headers.map(sanitizeExcelCell),
      ...rows.map((row) => row.map(sanitizeExcelCell)),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, `${filename}.xlsx`);
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
