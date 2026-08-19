import assert from "node:assert/strict";
import test from "node:test";
import { detectIncidents, formatDuration, minutesFromTime } from "../lib/detect-incidents";
import type { AttendanceRecord } from "../lib/types";

function record(overrides: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    rowNumber: 2,
    sector: "Administración",
    employeeName: "PERSONA DE PRUEBA",
    employeeId: "100001",
    taxId: "20-12345678-9",
    weekday: "Lunes",
    date: new Date(2026, 7, 10, 12),
    movements: ["07:08", "11:02", "11:44", "16:01"],
    shiftStart: "07:00",
    interval: "11:00 - 11:30",
    ...overrides,
  };
}

test("detecta tardanza y descanso, incluso sin fichada final", () => {
  const candidates = detectIncidents(
    [record({ movements: ["07:08", "11:02", "11:44"] })],
    { lateToleranceMinutes: 0, breakLimitMinutes: 30 },
  );

  assert.equal(candidates.length, 2);
  assert.equal(candidates.find((candidate) => candidate.type === "late")?.totalMinutes, 8);
  assert.equal(candidates.find((candidate) => candidate.type === "break")?.totalMinutes, 12);
});

test("respeta los límites configurados", () => {
  const candidates = detectIncidents(
    [record()],
    { lateToleranceMinutes: 8, breakLimitMinutes: 42 },
  );

  assert.equal(candidates.length, 0);
});

test("agrupa varias fechas del mismo empleado y tipo", () => {
  const candidates = detectIncidents(
    [
      record(),
      record({
        rowNumber: 3,
        date: new Date(2026, 7, 11, 12),
        movements: ["07:05", "11:00", "11:30", "16:00"],
      }),
    ],
    { lateToleranceMinutes: 0, breakLimitMinutes: 30 },
  );

  const late = candidates.find((candidate) => candidate.type === "late");
  assert.equal(late?.details.length, 2);
  assert.equal(late?.totalMinutes, 13);
});

test("valida horarios y presenta duraciones", () => {
  assert.equal(minutesFromTime("07:05"), 425);
  assert.equal(minutesFromTime("25:00"), null);
  assert.equal(formatDuration(74), "1:14");
});
