import assert from "node:assert/strict";
import test from "node:test";
import {
  detectIncidents,
  expectedPunchCount,
  formatDuration,
  minutesFromTime,
} from "../lib/detect-incidents";
import type { AttendanceRecord } from "../lib/types";

function record(overrides: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    rowNumber: 2,
    sector: "Depósito",
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

test("detecta tardanza, descanso e irregularidad cuando falta la fichada final", () => {
  const candidates = detectIncidents(
    [record({ movements: ["07:08", "11:02", "11:44"] })],
    { lateToleranceMinutes: 0, breakLimitMinutes: 30 },
  );

  assert.equal(candidates.length, 3);
  assert.equal(candidates.find((candidate) => candidate.type === "late")?.totalMinutes, 8);
  assert.equal(candidates.find((candidate) => candidate.type === "break")?.totalMinutes, 12);
  const irregularity = candidates.find((candidate) => candidate.type === "irregularity");
  assert.equal(irregularity?.details[0].actualCount, 3);
  assert.equal(irregularity?.details[0].expectedCount, 4);
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

test("los sectores especiales esperan dos fichadas y no controlan descanso", () => {
  for (const sector of ["Administración", "REPARTO", "Ventas mayoristas", "Cocina"]) {
    const candidates = detectIncidents(
      [record({ sector, movements: ["07:00", "16:00"] })],
      { lateToleranceMinutes: 0, breakLimitMinutes: 30 },
    );

    assert.equal(candidates.length, 0, sector);
  }
});

test("acepta fichadas adicionales en los sectores de dos movimientos", () => {
  const specialSector = detectIncidents(
    [record({ sector: "Administración", movements: ["07:00", "11:00", "11:45", "16:00"] })],
    { lateToleranceMinutes: 0, breakLimitMinutes: 30 },
  );
  assert.deepEqual(specialSector, []);

  const incompleteSpecialSector = detectIncidents(
    [record({ sector: "Administración", movements: ["07:00"] })],
    { lateToleranceMinutes: 0, breakLimitMinutes: 30 },
  );
  assert.deepEqual(
    incompleteSpecialSector.map((candidate) => candidate.type),
    ["irregularity"],
  );

  const regularSector = detectIncidents(
    [record({ movements: ["07:00", "11:00", "11:30", "16:00", "16:05"] })],
    { lateToleranceMinutes: 0, breakLimitMinutes: 30 },
  );
  assert.deepEqual(regularSector.map((candidate) => candidate.type), ["irregularity"]);
});

test("clasifica los sectores sin depender de mayúsculas o tildes", () => {
  assert.equal(expectedPunchCount("Administración central"), 2);
  assert.equal(expectedPunchCount("Venta"), 2);
  assert.equal(expectedPunchCount("VENTAS"), 2);
  assert.equal(expectedPunchCount("Depósito"), 4);
});

test("excluye del análisis los días desactivados", () => {
  const candidates = detectIncidents(
    [
      record({
        rowNumber: 1,
        date: new Date(2026, 7, 9, 12),
        movements: ["07:10", "11:00", "11:30", "16:00"],
      }),
      record(),
    ],
    {
      lateToleranceMinutes: 0,
      breakLimitMinutes: 30,
      includedWeekdays: [1],
    },
  );

  const late = candidates.find((candidate) => candidate.type === "late");
  assert.equal(late?.details.length, 1);
  assert.equal(late?.details[0].date.getDay(), 1);
  assert.equal(late?.totalMinutes, 8);

  assert.deepEqual(
    detectIncidents([record()], {
      lateToleranceMinutes: 0,
      breakLimitMinutes: 30,
      includedWeekdays: [],
    }),
    [],
  );
});

test("valida horarios y presenta duraciones", () => {
  assert.equal(minutesFromTime("07:05"), 425);
  assert.equal(minutesFromTime("25:00"), null);
  assert.equal(formatDuration(74), "1:14");
});
