export type IncidentType = "late" | "break";

export interface AttendanceRecord {
  rowNumber: number;
  sector: string;
  employeeName: string;
  employeeId: string;
  taxId: string;
  weekday: string;
  date: Date;
  movements: string[];
  shiftStart: string | null;
  interval: string;
}

export interface LateIncident {
  type: "late";
  date: Date;
  shiftStart: string;
  clockIn: string;
  lateMinutes: number;
}

export interface BreakIncident {
  type: "break";
  date: Date;
  breakStart: string;
  breakEnd: string;
  breakMinutes: number;
  excessMinutes: number;
}

export type IncidentDetail = LateIncident | BreakIncident;

export interface NotificationCandidate {
  id: string;
  type: IncidentType;
  employeeName: string;
  employeeId: string;
  taxId: string;
  sector: string;
  details: IncidentDetail[];
  totalMinutes: number;
}

export interface DetectionSettings {
  lateToleranceMinutes: number;
  breakLimitMinutes: number;
}

export interface WorkbookData {
  fileName: string;
  sheetName: string;
  records: AttendanceRecord[];
  warnings: string[];
  dateFrom: Date;
  dateTo: Date;
  employeeCount: number;
}
