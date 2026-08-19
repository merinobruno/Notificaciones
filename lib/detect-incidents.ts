import type {
  AttendanceRecord,
  BreakIncident,
  DetectionSettings,
  IncidentDetail,
  IncidentType,
  LateIncident,
  NotificationCandidate,
} from "./types";

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

function candidateId(record: AttendanceRecord, type: IncidentType): string {
  return `${employeeKey(record)}::${type}`;
}

export function detectIncidents(
  records: AttendanceRecord[],
  settings: DetectionSettings,
): NotificationCandidate[] {
  const groups = new Map<
    string,
    Omit<NotificationCandidate, "details" | "totalMinutes"> & {
      details: IncidentDetail[];
    }
  >();

  const addIncident = (
    record: AttendanceRecord,
    type: IncidentType,
    detail: IncidentDetail,
  ) => {
    const id = candidateId(record, type);
    const existing = groups.get(id);
    if (existing) {
      existing.details.push(detail);
      return;
    }
    groups.set(id, {
      id,
      type,
      employeeName: record.employeeName,
      employeeId: record.employeeId,
      taxId: record.taxId,
      sector: record.sector,
      details: [detail],
    });
  };

  for (const record of records) {
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
        addIncident(record, "late", detail);
      }
    }

    // A missing final clock-out must not hide a valid break pair.
    if (record.movements.length >= 3) {
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
        addIncident(record, "break", detail);
      }
    }
  }

  return [...groups.values()]
    .map((group): NotificationCandidate => ({
      ...group,
      details: [...group.details].sort(
        (left, right) => left.date.getTime() - right.date.getTime(),
      ),
      totalMinutes: group.details.reduce(
        (sum, detail) =>
          sum +
          (detail.type === "late"
            ? detail.lateMinutes
            : detail.excessMinutes),
        0,
      ),
    }))
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
