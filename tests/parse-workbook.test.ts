import assert from "node:assert/strict";
import test from "node:test";
import { detectIncidents } from "../lib/detect-incidents";
import {
  parseWorkbookSheets,
  type WorkbookSheetData,
} from "../lib/parse-workbook";

const headers = [
  "Sector",
  "Usuario",
  "Legajo",
  "DNI",
  "Día de semana",
  "Fecha",
  "Movimientos",
  "Turno",
  "Intervalo",
];

function workbookSheet(row: unknown[]): WorkbookSheetData[] {
  return [
    {
      sheet: "Sectores",
      data: [headers, row] as WorkbookSheetData["data"],
    },
  ];
}

test("cada archivo produce un análisis independiente", () => {
  const first = parseWorkbookSheets(
    "semana-a.xlsx",
    workbookSheet([
      "Depósito",
      "PERSONA A",
      100001,
      "20-12345678-9",
      "Lunes",
      "10/08/2026",
      "07:08 - 11:00 - 11:30 - 16:00",
      "07:00 - 16:00",
      "11:00 - 11:30",
    ]),
  );
  const second = parseWorkbookSheets(
    "semana-b.xlsx",
    workbookSheet([
      "Depósito",
      "PERSONA B",
      100002,
      "27-12345678-8",
      "Martes",
      "11/08/2026",
      "06:58 - 11:00 - 11:30 - 16:00",
      "07:00 - 16:00",
      "11:00 - 11:30",
    ]),
  );

  const settings = { lateToleranceMinutes: 0, breakLimitMinutes: 30 };
  const firstCandidates = detectIncidents(first.records, settings);
  const secondCandidates = detectIncidents(second.records, settings);

  assert.equal(first.fileName, "semana-a.xlsx");
  assert.equal(second.fileName, "semana-b.xlsx");
  assert.deepEqual(firstCandidates.map((candidate) => candidate.id), [
    "100001::late",
  ]);
  assert.deepEqual(secondCandidates, []);
});
