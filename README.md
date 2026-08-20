# Notificaciones laborales · Fisterra

Aplicación web para convertir un reporte semanal de fichadas en notificaciones laborales individuales en formato Word.

## Qué hace

1. Lee un archivo `.xlsx` con las columnas `Usuario`, `Legajo`, `DNI`, `Fecha`, `Movimientos` y `Turno`.
2. Detecta llegadas posteriores al inicio de turno y descansos que superan el límite configurado.
3. Controla la cantidad esperada de fichadas y señala los días irregulares para revisión.
4. Agrupa las incidencias por empleado y tipo de notificación.
5. Permite revisar, filtrar, incluir o excluir casos antes de generar documentos.
6. Descarga un ZIP con un `.docx` por empleado y por tipo de notificación.

El Excel y los datos personales se procesan íntegramente en el navegador. No se envían ni almacenan en un servidor.

## Desarrollo local

Requiere Node.js 22.13 o posterior.

```bash
npm install
npm run dev
```

Abrir [http://localhost:3000](http://localhost:3000).

Comandos de verificación:

```bash
npm test
npm run lint
npm run build
```

## Publicar en Vercel

1. Importar este repositorio desde Vercel.
2. Mantener el framework detectado como **Next.js**.
3. No hace falta configurar variables de entorno ni servicios externos.
4. Ejecutar el despliegue.

La aplicación es estática desde el punto de vista de datos: todo el procesamiento sensible ocurre en el dispositivo del usuario.

## Criterios configurables

- Tolerancia para llegadas tarde: `0` minutos por defecto.
- Duración permitida de descanso: `30` minutos por defecto.
- Fecha que se imprime en la notificación.
- Días de la semana incluidos en el análisis; todos quedan activos inicialmente.

El descanso se calcula por la duración entre las fichadas 2 y 3, sin comparar el horario fijo del intervalo informado en el Excel. Administración, Reparto, Ventas y Cocina requieren al menos 2 fichadas y no se controlan por descanso; registrar más de 2 no se considera irregular. Los demás sectores esperan exactamente 4 fichadas. Las cantidades inválidas aparecen en la solapa **Irregularidades** como alertas de revisión y no generan documentos Word.

Las reglas automáticas generan una preselección. La revisión humana previa a la descarga es parte del flujo porque el Excel puede contener excepciones, fichadas incompletas o cambios de turno.

## Marca y documentos

La interfaz usa los recursos oficiales de Fisterra incluidos en `public/brand`. Los documentos Word reproducen la estructura, tipografía, tabla y textos de los ejemplos de referencia provistos para el proyecto.

Los textos disciplinarios deben ser revisados por el área responsable antes de su uso definitivo.
