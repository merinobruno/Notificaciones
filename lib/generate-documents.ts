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
  DocumentIncidentDetail,
  DocumentNotificationCandidate,
  IrregularityNotificationCandidate,
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
const IRREGULARITY_TABLE_WIDTHS = [1800, 3960, 1800, 1800];

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

function detailDate(detail: DocumentIncidentDetail): string {
  return `${formatDateNumeric(detail.date)} (${WEEKDAYS[detail.date.getDay()]})`;
}

function cell(
  text: string,
  width: number,
  header = false,
  fontSize?: number,
): TableCell {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 80, right: 80, bottom: 80, left: 80 },
    shading: header
      ? { fill: "D9D9D9", type: ShadingType.CLEAR, color: "auto" }
      : undefined,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text, bold: header, size: fontSize })],
      }),
    ],
  });
}

function detailTable(
  candidate: DocumentNotificationCandidate,
  breakLimitMinutes: number,
): Table {
  let headers: string[];
  let widths: number[];
  let fontSize: number | undefined;
  let rows: TableRow[];

  if (candidate.type === "late") {
    headers = ["Fecha", "Horario de Turno", "Horario Fichado", "Minutos de Tardanza"];
    widths = TABLE_WIDTHS;
    rows = candidate.details.map((detail) => {
      const values = [
        detailDate(detail),
        detail.shiftStart,
        detail.clockIn,
        formatDuration(detail.lateMinutes),
      ];
      return new TableRow({
        cantSplit: true,
        children: values.map((value, index) => cell(value, widths[index])),
      });
    });
  } else if (candidate.type === "break") {
    headers = [
      "Fecha",
      "Salida a Descanso",
      "Regreso de Descanso",
      `Minutos de Exceso (sobre ${breakLimitMinutes} min.)`,
    ];
    widths = TABLE_WIDTHS;
    rows = candidate.details.map((detail) => {
      const values = [
        detailDate(detail),
        detail.breakStart,
        detail.breakEnd,
        `${formatDuration(detail.breakMinutes)} (+${detail.excessMinutes})`,
      ];
      return new TableRow({
        cantSplit: true,
        children: values.map((value, index) => cell(value, widths[index])),
      });
    });
  } else {
    headers = [
      "Fecha",
      "Fichadas registradas",
      "Cantidad registrada",
      "Cantidad requerida",
    ];
    widths = IRREGULARITY_TABLE_WIDTHS;
    fontSize = 20;
    rows = candidate.details.map((detail) => {
      const values = [
        detailDate(detail),
        detail.movements.length ? detail.movements.join(" - ") : "Sin fichadas",
        String(detail.actualCount),
        String(detail.expectedCount),
      ];
      return new TableRow({
        cantSplit: true,
        children: values.map((value, index) =>
          cell(value, widths[index], false, fontSize),
        ),
      });
    });
  }

  const border = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
  const tableWidth = widths.reduce((sum, width) => sum + width, 0);
  return new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths: widths,
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
          cell(value, widths[index], true, fontSize),
        ),
      }),
      ...rows,
    ],
  });
}

type NoticeParagraphOptions = {
  alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
  bold?: boolean;
  size?: number;
  before?: number;
  after?: number;
};

function noticeRunsParagraph(
  runs: Array<{ text: string; bold?: boolean; size?: number }>,
  options: NoticeParagraphOptions = {},
): Paragraph {
  return new Paragraph({
    alignment: options.alignment,
    spacing: {
      before: options.before,
      after: options.after,
      line: 240,
    },
    children: runs.map(
      (run) =>
        new TextRun({
          text: run.text,
          bold: run.bold ?? options.bold,
          size: run.size ?? options.size,
        }),
    ),
  });
}

function noticeParagraph(
  text: string,
  options: NoticeParagraphOptions = {},
): Paragraph {
  return noticeRunsParagraph([{ text }], options);
}

function buildIrregularityDocument(
  candidate: IrregularityNotificationCandidate,
  letterDate: Date,
): Document {
  const children = [
    noticeParagraph(`Neuquén, ${formatLongDate(letterDate)}.-`, {
      alignment: AlignmentType.RIGHT,
      after: 240,
    }),
    noticeParagraph(`Sr./Sra. ${candidate.employeeName}`, { bold: true }),
    noticeParagraph(`CUIL: ${candidate.taxId}`, { size: 20 }),
    noticeParagraph(`Sector: ${candidate.sector}`, { size: 20, after: 320 }),
    noticeRunsParagraph(
      [
        { text: "En uso de la facultad de imponer medidas disciplinarias, le notifico a usted que se ha tomado la decisión de " },
        { text: "sancionarlo expresamente con un apercibimiento formal", bold: true },
        { text: ", debido a los hechos que a continuación se detallan." },
      ],
      { alignment: AlignmentType.JUSTIFIED, after: 240 },
    ),
    noticeRunsParagraph(
      [
        { text: "Los motivos de esta sanción se fundan en la omisión y/o registración irregular de sus movimientos de ingreso, descanso, reingreso y/o salida mediante el " },
        { text: "sistema de control horario por huella dactilar", bold: true },
        { text: ", incumpliendo con la obligación de registrar adecuadamente la totalidad de sus fichadas diarias." },
      ],
      { alignment: AlignmentType.JUSTIFIED, after: 160 },
    ),
    noticeParagraph(
      "Detalle de registros de la máquina de huella dactilar (Omisiones de Registro por Huella):",
      { bold: true, size: 20, after: 80 },
    ),
    detailTable(candidate, 30),
    noticeRunsParagraph(
      [
        { text: "Téngase por intimado debidamente a regularizar esta situación y a mantener de forma consistente todos sus registros. " },
        { text: "Se lo apercibe expresamente por esta falta", bold: true },
        { text: " y se le advierte que la próxima vez que se verifique este incumplimiento se procederá a aplicar una medida disciplinaria más severa, tal como " },
        { text: "suspensión sin goce de haberes", bold: true },
        { text: ", entendiendo que la inconsistencia de dichos registros impide validar adecuadamente sus jornadas de trabajo y perjudica el control del personal." },
      ],
      { alignment: AlignmentType.JUSTIFIED, before: 240, after: 240 },
    ),
    noticeParagraph(
      "Se lo exhorta a que en el futuro cumpla estrictamente con las directivas impartidas, registre la totalidad de sus horarios obligatorios por huella dactilar y evite afectar la organización interna de la empresa, bajo apercibimiento de aplicar las sanciones disciplinarias ya mencionadas.",
      { alignment: AlignmentType.JUSTIFIED, after: 240 },
    ),
    noticeParagraph("Sin otro particular lo saludo atentamente.", {
      after: 520,
    }),
    noticeParagraph("____________________________________", {
      alignment: AlignmentType.CENTER,
    }),
    noticeParagraph("Firma del Empleado", {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 20,
    }),
    noticeParagraph("CUIL:", {
      alignment: AlignmentType.CENTER,
      bold: true,
      size: 20,
    }),
  ];

  return new Document({
    creator: "Fisterra",
    title: `${candidate.employeeName} - Irregularidades de fichada`,
    description: "Apercibimiento por irregularidades en el registro de fichadas.",
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: 22 },
          paragraph: { spacing: { after: 0, line: 240 } },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 12240,
              height: 15840,
              orientation: PageOrientation.PORTRAIT,
            },
            margin: {
              top: 1152,
              right: 1296,
              bottom: 1152,
              left: 1296,
              header: 720,
              footer: 720,
              gutter: 0,
            },
          },
        },
        children,
      },
    ],
  });
}

export function buildNotificationDocument(
  candidate: DocumentNotificationCandidate,
  letterDate: Date,
  breakLimitMinutes = 30,
): Document {
  if (candidate.type === "irregularity") {
    return buildIrregularityDocument(candidate, letterDate);
  }

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
  candidate: DocumentNotificationCandidate,
  dateFrom: Date,
  dateTo: Date,
): string {
  const type =
    candidate.type === "late"
      ? "Llegadas tarde"
      : candidate.type === "break"
        ? "Exceso descanso"
        : "Irregularidades de fichada";
  return safeFilePart(
    `${candidate.employeeName} - Legajo ${candidate.employeeId} - ${type} ${formatDateRange(dateFrom)} al ${formatDateRange(dateTo)}.docx`,
  );
}

export async function generateNotificationZip(
  candidates: DocumentNotificationCandidate[],
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
