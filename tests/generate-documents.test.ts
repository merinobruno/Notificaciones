import assert from "node:assert/strict";
import test from "node:test";
import { Packer } from "docx";
import {
  buildNotificationDocument,
  generateNotificationZip,
  notificationFileName,
} from "../lib/generate-documents";
import type { DocumentNotificationCandidate } from "../lib/types";

const candidate: DocumentNotificationCandidate = {
  id: "100001::break",
  type: "break",
  employeeName: "PERSONA DE PRUEBA",
  employeeId: "100001",
  taxId: "20-12345678-9",
  sector: "Administración",
  totalMinutes: 12,
  details: [
    {
      type: "break",
      date: new Date(2026, 7, 10, 12),
      breakStart: "11:02",
      breakEnd: "11:44",
      breakMinutes: 42,
      excessMinutes: 12,
    },
  ],
};

test("genera un DOCX válido y no vacío", async () => {
  const document = buildNotificationDocument(candidate, new Date(2026, 7, 19, 12));
  const buffer = await Packer.toBuffer(document);

  assert.ok(buffer.byteLength > 2_000);
  assert.equal(buffer.subarray(0, 2).toString(), "PK");
});

test("construye el nombre de archivo esperado", () => {
  assert.equal(
    notificationFileName(
      candidate,
      new Date(2026, 7, 10, 12),
      new Date(2026, 7, 15, 12),
    ),
    "PERSONA DE PRUEBA - Legajo 100001 - Exceso descanso 10-08 al 15-08.docx",
  );
});

test("empaqueta los documentos seleccionados en un ZIP", async () => {
  const result = await generateNotificationZip(
    [candidate],
    new Date(2026, 7, 19, 12),
    new Date(2026, 7, 10, 12),
    new Date(2026, 7, 15, 12),
  );

  assert.ok(result.blob.size > 2_000);
  assert.equal(result.fileName, "Notificaciones - Semana 10-08 al 15-08.zip");
});
