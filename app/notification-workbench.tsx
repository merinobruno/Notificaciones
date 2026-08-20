"use client";

import Image from "next/image";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileSpreadsheet,
  FileText,
  LoaderCircle,
  RotateCcw,
  Search,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  detectIncidents,
  formatDuration,
  isDocumentCandidate,
} from "@/lib/detect-incidents";
import {
  downloadBlob,
  formatDateNumeric,
  generateNotificationZip,
} from "@/lib/generate-documents";
import { parseWorkbook } from "@/lib/parse-workbook";
import type {
  DetectionSettings,
  IncidentDetail,
  IncidentType,
  NotificationCandidate,
  WorkbookData,
} from "@/lib/types";

type TypeFilter = "all" | IncidentType;

function todayInputValue(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

function typeLabel(type: IncidentType): string {
  if (type === "late") return "Llegadas tarde";
  if (type === "break") return "Exceso de descanso";
  return "Fichadas irregulares";
}

function detailDate(detail: IncidentDetail): string {
  const weekday = new Intl.DateTimeFormat("es-AR", { weekday: "short" })
    .format(detail.date)
    .replace(".", "");
  return `${formatDateNumeric(detail.date)} · ${weekday}`;
}

function CandidateDetails({ candidate }: { candidate: NotificationCandidate }) {
  const headers =
    candidate.type === "late"
      ? ["Fecha", "Turno → fichada", "Tardanza"]
      : candidate.type === "break"
        ? ["Fecha", "Salida → regreso", "Exceso"]
        : ["Fecha", "Horarios registrados", "Cantidad"];

  return (
    <div className={`candidate-details ${candidate.type}`}>
      <div className="detail-table-head">
        {headers.map((header) => <span key={header}>{header}</span>)}
      </div>
      {candidate.type === "late" && candidate.details.map((detail, index) => (
          <div className="detail-table-row" key={`${detail.date.toISOString()}-${index}`}>
            <span>{detailDate(detail)}</span>
            <strong>{detail.shiftStart} → {detail.clockIn}</strong>
            <em>+{detail.lateMinutes} min</em>
          </div>
        ))}
      {candidate.type === "break" && candidate.details.map((detail, index) => (
          <div className="detail-table-row" key={`${detail.date.toISOString()}-${index}`}>
            <span>{detailDate(detail)}</span>
            <strong>{detail.breakStart} → {detail.breakEnd}</strong>
            <em>+{detail.excessMinutes} min</em>
          </div>
        ))}
      {candidate.type === "irregularity" && candidate.details.map((detail, index) => (
          <div className="detail-table-row" key={`${detail.date.toISOString()}-${index}`}>
            <span>{detailDate(detail)}</span>
            <strong>{detail.movements.length ? detail.movements.join(" · ") : "Sin fichadas"}</strong>
            <em>{detail.actualCount} de {detail.expectedCount}</em>
          </div>
        ))}
    </div>
  );
}

export default function NotificationWorkbench() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const readRequestRef = useRef(0);
  const [workbook, setWorkbook] = useState<WorkbookData | null>(null);
  const [analysisRevision, setAnalysisRevision] = useState(0);
  const [fileName, setFileName] = useState("");
  const [isReading, setIsReading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const [generatedMessage, setGeneratedMessage] = useState("");
  const [generatedOnce, setGeneratedOnce] = useState(false);
  const [letterDate, setLetterDate] = useState(todayInputValue);
  const [settings, setSettings] = useState<DetectionSettings>({
    lateToleranceMinutes: 0,
    breakLimitMinutes: 30,
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");

  const candidates = useMemo(
    () => detectIncidents(workbook?.records ?? [], settings),
    [workbook, settings],
  );

  const documentCandidates = useMemo(
    () => candidates.filter(isDocumentCandidate),
    [candidates],
  );

  const filteredCandidates = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("es");
    return candidates.filter((candidate) => {
      const matchesType = typeFilter === "all" || candidate.type === typeFilter;
      const matchesSearch =
        !normalizedSearch ||
        candidate.employeeName.toLocaleLowerCase("es").includes(normalizedSearch) ||
        candidate.employeeId.includes(normalizedSearch) ||
        candidate.sector.toLocaleLowerCase("es").includes(normalizedSearch);
      return matchesType && matchesSearch;
    });
  }, [candidates, search, typeFilter]);

  const selectedCandidates = documentCandidates.filter((candidate) =>
    selectedIds.has(candidate.id),
  );
  const selectedLate = selectedCandidates.filter((candidate) => candidate.type === "late").length;
  const selectedBreak = selectedCandidates.filter((candidate) => candidate.type === "break").length;
  const irregularityCount = candidates
    .filter((candidate) => candidate.type === "irregularity")
    .reduce((sum, candidate) => sum + candidate.details.length, 0);
  const currentStep = generatedOnce ? 3 : workbook ? 2 : 1;

  const processFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("Elegí un archivo Excel con extensión .xlsx.");
      return;
    }
    const requestId = readRequestRef.current + 1;
    readRequestRef.current = requestId;
    setIsReading(true);
    setWorkbook(null);
    setFileName(file.name);
    setSelectedIds(new Set());
    setExpandedIds(new Set());
    setGeneratedOnce(false);
    setError("");
    setGeneratedMessage("");
    try {
      const result = await parseWorkbook(file);
      if (requestId !== readRequestRef.current) return;
      const detected = detectIncidents(result.records, settings);
      setWorkbook(result);
      setFileName(file.name);
      setSelectedIds(
        new Set(detected.filter(isDocumentCandidate).map((candidate) => candidate.id)),
      );
      setExpandedIds(new Set());
      setAnalysisRevision((current) => current + 1);
      setSearch("");
      setTypeFilter("all");
      window.setTimeout(
        () => document.getElementById("revision")?.scrollIntoView({ behavior: "smooth" }),
        80,
      );
    } catch (cause) {
      if (requestId !== readRequestRef.current) return;
      setWorkbook(null);
      setFileName("");
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo interpretar el archivo seleccionado.",
      );
    } finally {
      if (requestId === readRequestRef.current) {
        setIsReading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void processFile(event.target.files?.[0]);
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void processFile(event.dataTransfer.files?.[0]);
  };

  const resetWorkbook = () => {
    readRequestRef.current += 1;
    setWorkbook(null);
    setFileName("");
    setError("");
    setGeneratedMessage("");
    setGeneratedOnce(false);
    setSelectedIds(new Set());
    if (fileInputRef.current) fileInputRef.current.value = "";
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setGeneratedMessage("");
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectFiltered = (selected: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const candidate of filteredCandidates) {
        if (!isDocumentCandidate(candidate)) continue;
        if (selected) next.add(candidate.id);
        else next.delete(candidate.id);
      }
      return next;
    });
  };

  const updateSettings = (value: DetectionSettings) => {
    setSettings(value);
    if (workbook) {
      const detected = detectIncidents(workbook.records, value);
      setSelectedIds(
        new Set(detected.filter(isDocumentCandidate).map((candidate) => candidate.id)),
      );
      setExpandedIds(new Set());
      setGeneratedMessage("");
    }
  };

  const generateDocuments = async () => {
    if (!workbook || !selectedCandidates.length) return;
    setIsGenerating(true);
    setError("");
    setGeneratedMessage("");
    try {
      const issueDate = new Date(`${letterDate}T12:00:00`);
      const { blob, fileName: zipName } = await generateNotificationZip(
        selectedCandidates,
        issueDate,
        workbook.dateFrom,
        workbook.dateTo,
        settings.breakLimitMinutes,
      );
      downloadBlob(blob, zipName);
      setGeneratedOnce(true);
      setGeneratedMessage(
        `Se generaron ${selectedCandidates.length} documentos dentro de “${zipName}”.`,
      );
    } catch {
      setError("Ocurrió un problema al generar los documentos. Volvé a intentarlo.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="Ir al inicio">
          <Image
            src="/brand/logo/fisterra-lockup-horizontal.svg"
            alt="Fisterra"
            width={184}
            height={40}
            loading="eager"
          />
          <span className="brand-area">Rubros laborales</span>
        </a>
        <div className="privacy-badge">
          <ShieldCheck size={16} aria-hidden="true" />
          Procesamiento local y privado
        </div>
      </header>

      <section className="hero" id="inicio">
        <div>
          <p className="eyebrow">CONTROL DE ASISTENCIA</p>
          <h1>
            <span>NOTIFICACIONES</span>
            <span>LABORALES</span>
          </h1>
          <p className="hero-copy">
            Cargá el reporte semanal, verificá cada incidencia y generá los
            documentos Word en una sola descarga.
          </p>
        </div>
        <ol className="steps" aria-label={`Paso ${currentStep} de 3`}>
          {["Cargar", "Revisar", "Generar"].map((step, index) => {
            const number = index + 1;
            return (
              <li
                className={number === currentStep ? "active" : number < currentStep ? "done" : ""}
                key={step}
              >
                <span>{number < currentStep ? <Check size={14} /> : number}</span>
                {step}
              </li>
            );
          })}
        </ol>
      </section>

      {!workbook ? (
        <section className="workspace" aria-label="Carga y configuración">
          <article className="primary-card">
            <div className="card-heading">
              <div>
                <p className="section-kicker">PASO 1</p>
                <h2>Cargá el Excel semanal</h2>
                <p>Usá el reporte que contiene las fichadas del período.</p>
              </div>
              <span className="format-pill">.XLSX</span>
            </div>

            <label
              className={`upload-zone ${isDragging ? "dragging" : ""}`}
              onDragEnter={() => setIsDragging(true)}
              onDragLeave={() => setIsDragging(false)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                onChange={handleFileChange}
                disabled={isReading}
              />
              <span className="upload-symbol" aria-hidden="true">
                {isReading ? <LoaderCircle className="spinning" /> : <UploadCloud />}
              </span>
              <strong>{isReading ? "Leyendo el reporte…" : "Arrastrá el archivo acá"}</strong>
              <span>o hacé clic para buscarlo en tu computadora</span>
              <em><ShieldCheck size={14} /> El archivo nunca se envía a un servidor.</em>
            </label>

            {error && (
              <div className="alert error-alert" role="alert">
                <AlertTriangle size={18} />
                <span>{error}</span>
              </div>
            )}

            <div className="trust-row">
              <div><FileSpreadsheet /><strong>Lectura automática</strong><small>Empleados, CUIL y fichadas</small></div>
              <div><CheckCircle2 /><strong>Control humano</strong><small>Elegís qué documentos generar</small></div>
              <div><FileText /><strong>Salida ordenada</strong><small>Word separados dentro de un ZIP</small></div>
            </div>
          </article>

          <SettingsPanel
            letterDate={letterDate}
            settings={settings}
            onLetterDateChange={setLetterDate}
            onSettingsChange={updateSettings}
          />
        </section>
      ) : (
        <section
          className="review-shell"
          id="revision"
          key={`analysis-${analysisRevision}`}
        >
          <div className="file-strip">
            <div className="file-strip-icon"><FileSpreadsheet /></div>
            <div>
              <strong>{fileName}</strong>
              <span>
                Hoja “{workbook.sheetName}” · {workbook.records.length} registros · {workbook.employeeCount} empleados · {formatDateNumeric(workbook.dateFrom)} al {formatDateNumeric(workbook.dateTo)}
              </span>
            </div>
            <button type="button" className="ghost-button" onClick={resetWorkbook}>
              <RotateCcw size={15} /> Cambiar archivo
            </button>
          </div>

          {workbook.warnings.map((warning) => (
            <div className="alert warning-alert" role="status" key={warning}>
              <AlertTriangle size={17} /> {warning}
            </div>
          ))}

          <div className="summary-grid">
            <SummaryCard icon={<FileText />} value={selectedCandidates.length} label="Documentos seleccionados" />
            <SummaryCard icon={<Clock3 />} value={selectedLate} label="Avisos por tardanza" tone="late" />
            <SummaryCard icon={<Clock3 />} value={selectedBreak} label="Avisos por descanso" tone="break" />
            <SummaryCard icon={<AlertTriangle />} value={irregularityCount} label="Registros irregulares" tone="irregularity" />
          </div>

          <div className="review-layout">
            <article className="review-card">
              <div className="review-heading">
                <div>
                  <p className="section-kicker">PASO 2</p>
                  <h2>Revisá los resultados</h2>
                  <p>Las notificaciones se preseleccionan; las irregularidades quedan señaladas solo para revisión.</p>
                </div>
                <span className="counter-chip">{selectedCandidates.length} docs · {irregularityCount} alertas</span>
              </div>

              <div className="review-toolbar">
                <label className="search-field">
                  <Search size={17} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar empleado, legajo o sector"
                    aria-label="Buscar notificaciones"
                  />
                </label>
                <div className="filter-tabs" aria-label="Filtrar por tipo">
                  {([
                    ["all", "Todos"],
                    ["late", "Tardanzas"],
                    ["break", "Descansos"],
                    ["irregularity", "Irregularidades"],
                  ] as const).map(([value, label]) => (
                    <button
                      type="button"
                      className={typeFilter === value ? "active" : ""}
                      onClick={() => setTypeFilter(value)}
                      key={value}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="selection-actions">
                <span>{filteredCandidates.length} resultados</span>
                {filteredCandidates.some(isDocumentCandidate) ? (
                  <div>
                    <button type="button" onClick={() => selectFiltered(true)}>Seleccionar visibles</button>
                    <button type="button" onClick={() => selectFiltered(false)}>Quitar visibles</button>
                  </div>
                ) : (
                  <span className="review-only-note"><AlertTriangle size={13} /> Alertas solo para revisión</span>
                )}
              </div>

              <div className="candidate-list">
                {filteredCandidates.length ? (
                  filteredCandidates.map((candidate) => {
                    const documentCandidate = isDocumentCandidate(candidate);
                    const selected = selectedIds.has(candidate.id);
                    const expanded = expandedIds.has(candidate.id);
                    return (
                      <div
                        className={`candidate ${selected ? "selected" : ""} ${documentCandidate ? "" : "review-only"}`}
                        key={`${analysisRevision}-${candidate.id}`}
                      >
                        <div className="candidate-main">
                          {documentCandidate ? (
                            <label className="checkbox-control">
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleSelection(candidate.id)}
                                aria-label={`${selected ? "Excluir" : "Incluir"} ${candidate.employeeName}`}
                              />
                              <span><Check size={14} /></span>
                            </label>
                          ) : (
                            <span className="irregular-marker" title="Esta alerta no genera un documento">
                              <AlertTriangle size={14} />
                            </span>
                          )}
                          <div className="avatar">{initials(candidate.employeeName)}</div>
                          <div className="candidate-identity">
                            <strong>{candidate.employeeName}</strong>
                            <span>Legajo {candidate.employeeId} · {candidate.sector}</span>
                            <small className={!candidate.taxId ? "missing" : ""}>
                              {candidate.taxId ? `CUIL ${candidate.taxId}` : "CUIL sin informar"}
                            </small>
                          </div>
                          <span className={`type-badge ${candidate.type}`}>
                            <i /> {typeLabel(candidate.type)}
                          </span>
                          <div className="incident-count">
                            <strong>{candidate.details.length}</strong>
                            <span>
                              {candidate.type === "irregularity"
                                ? candidate.details.length === 1 ? "día" : "días"
                                : candidate.details.length === 1 ? "incidencia" : "incidencias"}
                            </span>
                          </div>
                          <div className="incident-total">
                            {candidate.type === "irregularity" ? (
                              <><strong>Revisar</strong><span>no genera Word</span></>
                            ) : (
                              <><strong>+{formatDuration(candidate.totalMinutes)}</strong><span>acumulado</span></>
                            )}
                          </div>
                          <button
                            type="button"
                            className={`expand-button ${expanded ? "expanded" : ""}`}
                            onClick={() => toggleExpanded(candidate.id)}
                            aria-expanded={expanded}
                            aria-label={`${expanded ? "Ocultar" : "Ver"} detalle de ${candidate.employeeName}`}
                          >
                            <ChevronDown size={18} />
                          </button>
                        </div>
                        {expanded && <CandidateDetails candidate={candidate} />}
                      </div>
                    );
                  })
                ) : (
                  <div className="empty-results">
                    <Search size={25} />
                    <strong>No hay coincidencias</strong>
                    <span>Probá con otro nombre o cambiá el filtro.</span>
                  </div>
                )}
              </div>
            </article>

            <div className="side-column">
              <SettingsPanel
                letterDate={letterDate}
                settings={settings}
                onLetterDateChange={setLetterDate}
                onSettingsChange={updateSettings}
                compact
              />

              <aside className="generate-card">
                <p className="section-kicker">PASO 3</p>
                <h2>Generá los documentos</h2>
                <p>
                  Se descargará un ZIP con un Word por empleado y por tipo de notificación.
                </p>
                <div className="generation-summary">
                  <span><i className="late" />Tardanzas <strong>{selectedLate}</strong></span>
                  <span><i className="break" />Descansos <strong>{selectedBreak}</strong></span>
                </div>
                <button
                  type="button"
                  className="primary-button"
                  disabled={!selectedCandidates.length || isGenerating}
                  onClick={() => void generateDocuments()}
                >
                  {isGenerating ? <LoaderCircle className="spinning" /> : <Download />}
                  {isGenerating
                    ? "Preparando documentos…"
                    : `Descargar ${selectedCandidates.length} documento${selectedCandidates.length === 1 ? "" : "s"}`}
                </button>
                <small><ShieldCheck size={14} /> Generación local, sin almacenar datos</small>
              </aside>
            </div>
          </div>

          {generatedMessage && (
            <div className="toast success-toast" role="status">
              <CheckCircle2 />
              <div><strong>Descarga preparada</strong><span>{generatedMessage}</span></div>
            </div>
          )}
          {error && (
            <div className="toast error-toast" role="alert">
              <AlertTriangle />
              <div><strong>No se pudo completar</strong><span>{error}</span></div>
            </div>
          )}
        </section>
      )}

      <footer className="site-footer">
        <Image src="/brand/logo/fisterra-isotipo.svg" alt="" width={24} height={24} />
        <span>Fisterra · Rubros laborales</span>
        <span>Los datos se procesan únicamente en este dispositivo.</span>
      </footer>
    </main>
  );
}

function SettingsPanel({
  letterDate,
  settings,
  onLetterDateChange,
  onSettingsChange,
  compact = false,
}: {
  letterDate: string;
  settings: DetectionSettings;
  onLetterDateChange: (value: string) => void;
  onSettingsChange: (value: DetectionSettings) => void;
  compact?: boolean;
}) {
  return (
    <aside className={`settings-card ${compact ? "compact-settings" : ""}`}>
      <div className="card-heading compact">
        <div>
          <p className="section-kicker">CONFIGURACIÓN</p>
          <h2>Reglas de detección</h2>
        </div>
      </div>
      <label className="field-label">
        Fecha de la notificación
        <input
          type="date"
          value={letterDate}
          onChange={(event) => onLetterDateChange(event.target.value)}
        />
      </label>
      <div className="rule-field">
        <div>
          <span className="rule-dot late" />
          <strong>Llegada tarde</strong>
          <small>Minutos de tolerancia</small>
        </div>
        <div className="number-control">
          <input
            aria-label="Minutos de tolerancia para llegadas tarde"
            type="number"
            value={settings.lateToleranceMinutes}
            min="0"
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                lateToleranceMinutes: Math.max(0, Number(event.target.value) || 0),
              })
            }
          />
          <span>min.</span>
        </div>
      </div>
      <div className="rule-field">
        <div>
          <span className="rule-dot break" />
          <strong>Exceso de descanso</strong>
          <small>Duración permitida</small>
        </div>
        <div className="number-control">
          <input
            aria-label="Minutos permitidos de descanso"
            type="number"
            value={settings.breakLimitMinutes}
            min="1"
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                breakLimitMinutes: Math.max(1, Number(event.target.value) || 1),
              })
            }
          />
          <span>min.</span>
        </div>
      </div>
      <div className="settings-note">
        <strong>El descanso se calcula entre las fichadas 2 y 3.</strong>
        <p>Administración, Reparto, Ventas y Cocina esperan 2 fichadas y no se controlan por descanso. Los demás sectores esperan 4; cualquier diferencia se muestra como irregularidad.</p>
      </div>
    </aside>
  );
}

function SummaryCard({
  icon,
  value,
  label,
  tone = "default",
}: {
  icon: ReactNode;
  value: number;
  label: string;
  tone?: "default" | "late" | "break" | "irregularity";
}) {
  return (
    <div className={`summary-card ${tone}`}>
      <span>{icon}</span>
      <div><strong>{value}</strong><small>{label}</small></div>
    </div>
  );
}
