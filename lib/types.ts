export type IncidentType = "late" | "break" | "irregularity";
export type DocumentIncidentType = Exclude<IncidentType, "irregularity">;

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

export interface IrregularityIncident {
  type: "irregularity";
  date: Date;
  movements: string[];
  actualCount: number;
  expectedCount: 2 | 4;
}

export type DocumentIncidentDetail = LateIncident | BreakIncident;
export type IncidentDetail = DocumentIncidentDetail | IrregularityIncident;

interface NotificationCandidateBase {
  id: string;
  employeeName: string;
  employeeId: string;
  taxId: string;
  sector: string;
  totalMinutes: number;
}

export interface LateNotificationCandidate extends NotificationCandidateBase {
  type: "late";
  details: LateIncident[];
}

export interface BreakNotificationCandidate extends NotificationCandidateBase {
  type: "break";
  details: BreakIncident[];
}

export interface IrregularityNotificationCandidate
  extends NotificationCandidateBase {
  type: "irregularity";
  details: IrregularityIncident[];
}

export type DocumentNotificationCandidate =
  | LateNotificationCandidate
  | BreakNotificationCandidate;

export type NotificationCandidate =
  | DocumentNotificationCandidate
  | IrregularityNotificationCandidate;

export interface DetectionSettings {
  lateToleranceMinutes: number;
  breakLimitMinutes: number;
  includedWeekdays?: number[];
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
