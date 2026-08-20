import type {
  AttendanceRecord,
  BreakIncident,
  DetectionSettings,
  IncidentDetail,
  IncidentType,
  IrregularityIncident,
  LateIncident,
  NotificationCandidate,
} from "./types";

const TWO_PUNCH_SECTORS = new Set([
  "administracion",
  "reparto",
  "venta",
  "ventas",
  "cocina",
]);

export function minutesFromTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function elapsedMinutes(start: string, end: string): number | null {
  const startMinutes = minutesFromTime(start);
  const endMinutes = minutesFromTime(end);
  if (startMinutes === null || endMinutes === null) return null;
  let result = endMinutes - startMinutes;
  if (result < -720) result += 24 * 60;
  return result;
}

function employeeKey(record: AttendanceRecord): string {
  return record.employeeId || record.employeeName;
}

function normalizeSector(value: string): string[] {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function expectedPunchCount(sector: string): 2 | 4 {
  return normalizeSector(sector).some((word) => TWO_PUNCH_SECTORS.has(word))
    ? 2
    : 4;
}

export function isDocumentCandidate(
  candidate: NotificationCandidate,
): candidate is Extract<NotificationCandidate, { type: "late" | "break" }> {
  return candidate.type === "late" || candidate.type === "break";
}

function candidateId(record: AttendanceRecord, type: IncidentType): string {
  return `${employeeKey(record)}::${type}`;
}

export function detectIncidents(
  records: AttendanceRecord[],
  settings: DetectionSettings,
): NotificationCandidate[] {
  const groups = new Map<string, NotificationCandidate>();

  const addIncident = (record: AttendanceRecord, detail: IncidentDetail) => {
    const type = detail.type;
    const id = candidateId(record, type);
    const existing = groups.get(id);
    if (existing) {
      if (existing.type === "late" && detail.type === "late") {
        existing.details.push(detail);
      } else if (existing.type === "break" && detail.type === "break") {
        existing.details.push(detail);
      } else if (
        existing.type === "irregularity" &&
        detail.type === "irregularity"
      ) {
        existing.details.push(detail);
      }
      return;
    }

    const base = {
      id,
      employeeName: record.employeeName,
      employeeId: record.employeeId,
      taxId: record.taxId,
      sector: record.sector,
      totalMinutes: 0,
    };

    if (detail.type === "late") {
      groups.set(id, { ...base, type: "late", details: [detail] });
    } else if (detail.type === "break") {
      groups.set(id, { ...base, type: "break", details: [detail] });
    } else {
      groups.set(id, { ...base, type: "irregularity", details: [detail] });
    }
  };

  for (const record of records) {
    if (
      settings.includedWeekdays &&
      !settings.includedWeekdays.includes(record.date.getDay())
    ) {
      continue;
    }

    const firstMovement = record.movements[0];
    if (firstMovement && record.shiftStart) {
      const delay = elapsedMinutes(record.shiftStart, firstMovement);
      if (delay !== null && delay > settings.lateToleranceMinutes) {
        const detail: LateIncident = {
          type: "late",
          date: record.date,
          shiftStart: record.shiftStart,
          clockIn: firstMovement,
          lateMinutes: delay,
        };
        addIncident(record, detail);
      }
    }

    const expectedCount = expectedPunchCount(record.sector);
    const hasIrregularPunchCount =
      expectedCount === 2
        ? record.movements.length < expectedCount
        : record.movements.length !== expectedCount;
    if (hasIrregularPunchCount) {
      const detail: IrregularityIncident = {
        type: "irregularity",
        date: record.date,
        movements: [...record.movements],
        actualCount: record.movements.length,
        expectedCount,
      };
      addIncident(record, detail);
    }

    // El descanso se mide únicamente entre las fichadas 2 y 3. El intervalo
    // fijo del Excel no se utiliza, y los sectores de dos fichadas se excluyen.
    if (expectedCount === 4 && record.movements.length >= 3) {
      const breakStart = record.movements[1];
      const breakEnd = record.movements[2];
      const duration = elapsedMinutes(breakStart, breakEnd);
      if (duration !== null && duration > settings.breakLimitMinutes) {
        const detail: BreakIncident = {
          type: "break",
          date: record.date,
          breakStart,
          breakEnd,
          breakMinutes: duration,
          excessMinutes: duration - settings.breakLimitMinutes,
        };
        addIncident(record, detail);
      }
    }
  }

  return [...groups.values()]
    .map((group): NotificationCandidate => {
      if (group.type === "late") {
        return {
          ...group,
          details: [...group.details].sort(
            (left, right) => left.date.getTime() - right.date.getTime(),
          ),
          totalMinutes: group.details.reduce(
            (sum, detail) => sum + detail.lateMinutes,
            0,
          ),
        };
      }
      if (group.type === "break") {
        return {
          ...group,
          details: [...group.details].sort(
            (left, right) => left.date.getTime() - right.date.getTime(),
          ),
          totalMinutes: group.details.reduce(
            (sum, detail) => sum + detail.excessMinutes,
            0,
          ),
        };
      }
      return {
        ...group,
        details: [...group.details].sort(
          (left, right) => left.date.getTime() - right.date.getTime(),
        ),
        totalMinutes: 0,
      };
    })
    .sort((left, right) => {
      const byName = left.employeeName.localeCompare(right.employeeName, "es");
      if (byName !== 0) return byName;
      return left.type.localeCompare(right.type);
    });
}

export function formatDuration(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}
