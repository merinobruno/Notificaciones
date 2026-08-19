import readXlsxFile from "read-excel-file/browser";
import type { AttendanceRecord, WorkbookData } from "./types";

type CellValue = string | number | boolean | Date | null;
type Row = CellValue[];

const REQUIRED_HEADERS = ["usuario", "legajo", "fecha", "movimientos", "turno"];

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cellText(value: CellValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(
      value.getMinutes(),
    ).padStart(2, "0")}`;
  }
  return String(value).trim();
}

function parseDate(value: CellValue | undefined): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 12);
  }
  if (typeof value === "number" && value > 20_000) {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const parsed = new Date(excelEpoch + value * 86_400_000);
    return new Date(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth(),
      parsed.getUTCDate(),
      12,
    );
  }
  const text = cellText(value);
  const dayFirst = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (dayFirst) {
    const parsed = new Date(
      Number(dayFirst[3]),
      Number(dayFirst[2]) - 1,
      Number(dayFirst[1]),
      12,
    );
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
  }
  return null;
}

function extractTimes(value: CellValue | undefined): string[] {
  if (value instanceof Date) return [cellText(value)];
  return cellText(value).match(/(?<!\d)\d{1,2}:\d{2}(?!\d)/g) ?? [];
}

function indexHeaders(row: Row): Map<string, number> {
  const result = new Map<string, number>();
  row.forEach((value, index) => result.set(normalizeHeader(value), index));
  return result;
}

function headerIndex(headers: Map<string, number>, names: string[]): number {
  for (const name of names) {
    const exact = headers.get(name);
    if (exact !== undefined) return exact;
  }
  return -1;
}

function hasAttendanceHeaders(row: Row): boolean {
  const names = new Set(row.map(normalizeHeader));
  return REQUIRED_HEADERS.every((header) => names.has(header));
}

function findHeaderRow(rows: Row[]): number {
  return rows.findIndex(hasAttendanceHeaders);
}

interface EmployeeMaster {
  taxId: string;
  sector: string;
}

function buildEmployeeMaster(rows: Row[]): Map<string, EmployeeMaster> {
  if (!rows.length) return new Map();
  const headerRow = rows.findIndex((row) => {
    const values = new Set(row.map(normalizeHeader));
    return values.has("legajo") && (values.has("dni") || values.has("cuil"));
  });
  if (headerRow < 0) return new Map();
  const headers = indexHeaders(rows[headerRow]);
  const idIndex = headerIndex(headers, ["legajo"]);
  const taxIdIndex = headerIndex(headers, ["dni", "cuil"]);
  const sectorIndex = headerIndex(headers, ["sector"]);
  const master = new Map<string, EmployeeMaster>();
  for (const row of rows.slice(headerRow + 1)) {
    const employeeId = cellText(row[idIndex]);
    if (!employeeId) continue;
    master.set(employeeId, {
      taxId: cellText(row[taxIdIndex]),
      sector: sectorIndex >= 0 ? cellText(row[sectorIndex]) : "",
    });
  }
  return master;
}

export async function parseWorkbook(file: File): Promise<WorkbookData> {
  const sheets = await readXlsxFile(file);
  const sheetNames = sheets.map((sheet) => sheet.sheet);
  if (!sheetNames.length) throw new Error("El archivo no contiene hojas legibles.");

  let selectedSheet = sheets.find(
    (sheet) => normalizeHeader(sheet.sheet) === "sectores",
  );
  let sheetName = selectedSheet?.sheet;
  let rows: Row[] | null = null;

  if (selectedSheet) {
    rows = selectedSheet.data as Row[];
    if (findHeaderRow(rows) < 0) {
      rows = null;
      sheetName = undefined;
      selectedSheet = undefined;
    }
  }

  if (!rows) {
    for (const candidateSheet of sheets) {
      const candidateRows = candidateSheet.data as Row[];
      if (findHeaderRow(candidateRows) >= 0) {
        rows = candidateRows;
        sheetName = candidateSheet.sheet;
        break;
      }
    }
  }

  if (!rows || !sheetName) {
    throw new Error(
      "No encontré una hoja con las columnas Usuario, Legajo, Fecha, Movimientos y Turno.",
    );
  }

  const masterSheet = sheets.find((sheet) => {
    const normalized = normalizeHeader(sheet.sheet);
    return normalized === "hoja2" || normalized.includes("empleado");
  });
  const master = masterSheet
    ? buildEmployeeMaster(masterSheet.data as Row[])
    : new Map<string, EmployeeMaster>();

  const headerRow = findHeaderRow(rows);
  const headers = indexHeaders(rows[headerRow]);
  const indexes = {
    sector: headerIndex(headers, ["sector"]),
    user: headerIndex(headers, ["usuario", "empleado"]),
    id: headerIndex(headers, ["legajo"]),
    taxId: headerIndex(headers, ["dni", "cuil"]),
    weekday: headerIndex(headers, ["dia de semana", "dia"]),
    date: headerIndex(headers, ["fecha"]),
    movements: headerIndex(headers, ["movimientos", "fichadas"]),
    shift: headerIndex(headers, ["turno", "horario turno"]),
    interval: headerIndex(headers, ["intervalo", "descanso"]),
  };

  const records: AttendanceRecord[] = [];
  let skippedRows = 0;
  for (let index = headerRow + 1; index < rows.length; index += 1) {
    const row = rows[index];
    const employeeName = cellText(row[indexes.user]).toUpperCase();
    const employeeId = cellText(row[indexes.id]);
    const date = parseDate(row[indexes.date]);
    if (!employeeName || !employeeId || !date) {
      if (row.some((cell) => cellText(cell))) skippedRows += 1;
      continue;
    }
    const masterEmployee = master.get(employeeId);
    const shiftTimes = extractTimes(row[indexes.shift]);
    records.push({
      rowNumber: index + 1,
      sector:
        (indexes.sector >= 0 ? cellText(row[indexes.sector]) : "") ||
        masterEmployee?.sector ||
        "Sin sector",
      employeeName,
      employeeId,
      taxId:
        (indexes.taxId >= 0 ? cellText(row[indexes.taxId]) : "") ||
        masterEmployee?.taxId ||
        "",
      weekday:
        indexes.weekday >= 0 ? cellText(row[indexes.weekday]) : "",
      date,
      movements: extractTimes(row[indexes.movements]),
      shiftStart: shiftTimes[0] ?? null,
      interval:
        indexes.interval >= 0 ? cellText(row[indexes.interval]) : "",
    });
  }

  if (!records.length) {
    throw new Error("La hoja fue encontrada, pero no contiene registros válidos.");
  }

  const warnings: string[] = [];
  if (skippedRows) {
    warnings.push(
      `${skippedRows} fila${skippedRows === 1 ? "" : "s"} no se pudieron interpretar y fueron omitidas.`,
    );
  }
  const missingTaxIds = new Set(
    records.filter((record) => !record.taxId).map((record) => record.employeeId),
  ).size;
  if (missingTaxIds) {
    warnings.push(
      `${missingTaxIds} empleado${missingTaxIds === 1 ? " no tiene" : "s no tienen"} CUIL/DNI en el archivo.`,
    );
  }

  const dates = records.map((record) => record.date.getTime());
  return {
    fileName: file.name,
    sheetName,
    records,
    warnings,
    dateFrom: new Date(Math.min(...dates)),
    dateTo: new Date(Math.max(...dates)),
    employeeCount: new Set(records.map((record) => record.employeeId)).size,
  };
}
