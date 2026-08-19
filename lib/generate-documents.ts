import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import JSZip from "jszip";
import { formatDuration } from "./detect-incidents";
import type {
  IncidentDetail,
  NotificationCandidate,
} from "./types";

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const WEEKDAYS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];

const TABLE_WIDTHS = [2000, 2500, 2500, 3000];

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatDateNumeric(date: Date): string {
  return `${twoDigits(date.getDate())}/${twoDigits(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function formatDateRange(date: Date): string {
  return `${twoDigits(date.getDate())}-${twoDigits(date.getMonth() + 1)}`;
}

export function formatLongDate(date: Date): string {
  return `${date.getDate()} de ${MONTHS[date.getMonth()]} de ${date.getFullYear()}`;
}

function blankParagraph(): Paragraph {
  return new Paragraph({ children: [] });
}

function textParagraph(text: string, bold = false): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold })],
  });
}

function detailDate(detail: IncidentDetail): string {
  return `${formatDateNumeric(detail.date)} (${WEEKDAYS[detail.date.getDay()]})`;
}

function cell(text: string, width: number, header = false): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    shading: header
      ? { fill: "D9D9D9", type: ShadingType.CLEAR, color: "auto" }
      : undefined,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text, bold: header })],
      }),
    ],
  });
}

function detailTable(
  candidate: NotificationCandidate,
  breakLimitMinutes: number,
): Table {
  const headers =
    candidate.type === "late"
      ? ["Fecha", "Horario de Turno", "Horario Fichado", "Minutos de Tardanza"]
      : [
          "Fecha",
          "Salida a Descanso",
          "Regreso de Descanso",
          `Minutos de Exceso (sobre ${breakLimitMinutes} min.)`,
        ];

  const rows = candidate.details.map((detail) => {
    const values =
      detail.type === "late"
        ? [
            detailDate(detail),
            detail.shiftStart,
            detail.clockIn,
            formatDuration(detail.lateMinutes),
          ]
        : [
            detailDate(detail),
            detail.breakStart,
            detail.breakEnd,
            `${formatDuration(detail.breakMinutes)} (+${detail.excessMinutes})`,
          ];
    return new TableRow({
      cantSplit: true,
      children: values.map((value, index) => cell(value, TABLE_WIDTHS[index])),
    });
  });

  const border = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
  return new Table({
    width: { size: 10000, type: WidthType.DXA },
    columnWidths: TABLE_WIDTHS,
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    rows: [
      new TableRow({
        tableHeader: true,
        cantSplit: true,
        children: headers.map((value, index) =>
          cell(value, TABLE_WIDTHS[index], true),
        ),
      }),
      ...rows,
    ],
  });
}

export function buildNotificationDocument(
  candidate: NotificationCandidate,
  letterDate: Date,
  breakLimitMinutes = 30,
): Document {
  const isLate = candidate.type === "late";
  const detailTitle = isLate
    ? "Detalle de registros de llegadas fuera de horario:"
    : "Detalle de registros de exceso de descanso/refrigerio:";

  const reason = isLate
    ? "La presente sanción se motiva en los registros de asistencia del sistema de huella dactilar, donde se han verificado e identificado sus ingresos fuera del horario obligatorio establecido, registrando llegadas tarde sin la debida justificación ni aviso previo a su superior directo."
    : `Los motivos de esta sanción se fundan en lo verificado mediante el registro de huella dactilar, habiéndose constatado que en las fechas que a continuación se detallan ha excedido el tiempo fijado para el descanso/refrigerio, tomando un lapso superior a los ${breakLimitMinutes} minutos reglamentarios impartidos por la empresa.`;

  const legalReminder = isLate
    ? "Le recordamos que es su obligación primordial prestar servicios con la debida puntualidad y asistencia regular (art. 84 de la LCT), actuando con criterio de buena fe y colaboración en el desempeño de sus tareas (arts. 62 y 63 de la LCT)."
    : "Dicha conducta constituye un incumplimiento a sus obligaciones laborales de actuar con diligencia, puntualidad y el debido criterio de colaboración y buena fe que debe regir la relación de trabajo (arts. 62, 63, 84 y 85 de la LCT).";

  const closingWarning = isLate
    ? "En consecuencia, se lo apercibe expresamente por estas llegadas tarde y se lo intima a ajustar de manera estricta el cumplimiento de sus horarios laborales. Queda usted notificado de que la reiteración de estas conductas dará lugar a la imposición de sanciones disciplinarias más severas, incluyendo la suspensión sin goce de haberes."
    : `Por lo expuesto, se lo apercibe expresamente por estos hechos y se lo intima a respetar de manera estricta el límite de ${breakLimitMinutes} minutos de refrigerio. Se le hace saber que la reiteración de este tipo de conductas dará lugar a la aplicación de sanciones disciplinarias más gravosas, tales como la suspensión sin goce de haberes.`;

  const children = [
    textParagraph(`Neuquén, ${formatLongDate(letterDate)}.-`),
    blankParagraph(),
    textParagraph(`Sr./Sra. ${candidate.employeeName}`),
    textParagraph(`CUIL: ${candidate.taxId}`),
    textParagraph(`Sector: ${candidate.sector}`),
    blankParagraph(),
    textParagraph(
      "En uso de la facultad de imponer medidas disciplinarias, le notifico a usted que se ha tomado la decisión de sancionarlo expresamente con un apercibimiento formal, debido a los hechos que a continuación se detallan.",
    ),
    blankParagraph(),
    textParagraph(reason),
    blankParagraph(),
    textParagraph(detailTitle, true),
    blankParagraph(),
    detailTable(candidate, breakLimitMinutes),
    blankParagraph(),
    textParagraph(legalReminder),
    blankParagraph(),
    textParagraph(closingWarning),
    blankParagraph(),
    textParagraph("Sin otro particular lo saludo atentamente."),
    blankParagraph(),
    blankParagraph(),
    textParagraph("____________________________________"),
    textParagraph("Firma del Empleado"),
    textParagraph("CUIL:"),
  ];

  return new Document({
    creator: "Fisterra",
    title: `${candidate.employeeName} - ${isLate ? "Llegadas tarde" : "Exceso descanso"}`,
    description: "Notificación laboral generada a partir del registro de asistencia.",
    styles: {
      default: {
        document: {
          run: { font: "Times New Roman", size: 20 },
          paragraph: { spacing: { after: 0, line: 200 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 11906,
              height: 16838,
              orientation: PageOrientation.PORTRAIT,
            },
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
              header: 708,
              footer: 708,
              gutter: 0,
            },
          },
        },
        children,
      },
    ],
  });
}

function safeFilePart(value: string): string {
  return value.replace(/[<>:"/\\|?*]/g, "-").replace(/\s+/g, " ").trim();
}

export function notificationFileName(
  candidate: NotificationCandidate,
  dateFrom: Date,
  dateTo: Date,
): string {
  const type = candidate.type === "late" ? "Llegadas tarde" : "Exceso descanso";
  return safeFilePart(
    `${candidate.employeeName} - Legajo ${candidate.employeeId} - ${type} ${formatDateRange(dateFrom)} al ${formatDateRange(dateTo)}.docx`,
  );
}

export async function generateNotificationZip(
  candidates: NotificationCandidate[],
  letterDate: Date,
  dateFrom: Date,
  dateTo: Date,
  breakLimitMinutes = 30,
): Promise<{ blob: Blob; fileName: string }> {
  const zip = new JSZip();
  for (const candidate of candidates) {
    const document = buildNotificationDocument(
      candidate,
      letterDate,
      breakLimitMinutes,
    );
    const contents = await Packer.toArrayBuffer(document);
    zip.file(notificationFileName(candidate, dateFrom, dateTo), contents);
  }
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  return {
    blob,
    fileName: `Notificaciones - Semana ${formatDateRange(dateFrom)} al ${formatDateRange(dateTo)}.zip`,
  };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}
