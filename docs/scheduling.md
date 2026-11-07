# Motor de programación (auto-scheduling)

Código: `src/shared/scheduling/` (puro, sin dependencias de DOM ni de DHTMLX, probado con vitest).
DHTMLX Gantt Community no incluye auto-scheduling ni ruta crítica (son de la edición Pro), así que
este motor los reemplaza. Se contrastó contra la edición Pro (8.0.6) usando la misma configuración
que usa la app web anterior: tiempo laboral lun–vie, `auto_types`, ASAP estricto.

## Qué calcula

`schedule(tasks, links, { calendar, strict = true, snapFixedStarts = false })` devuelve:

- fechas de inicio/fin por tarea (pasada hacia adelante),
- fechas tardías y holgura total (pasada hacia atrás),
- ruta crítica (holgura ≤ 0),
- ciclos detectados y vínculos omitidos,
- fin del proyecto.

## Reglas (igualan a Pro)

- Fin **exclusivo**: la fecha de fin es el día siguiente al último día laborable.
- Los desfases (lag) se cuentan en días laborables.
- Vínculos FS, SS, FF y SF (tipos `'0'`..`'3'`).
- Una tarea sin predecesoras conserva su inicio, aunque caiga en fin de semana
  (salvo `snapFixedStarts`).
- En la pasada hacia atrás, las tareas con sucesoras no se limitan por el fin del proyecto.
- Hitos: con vínculos dirigidos por el fin (FF/SF) o con lag positivo no se ajustan;
  con FS/SS y lag cero se ajustan al siguiente día laborable.
- Las tareas resumen toman el mínimo inicio y máximo fin de sus hijas.
- Los vínculos que tocan tareas resumen se omiten y se reportan en `skippedLinks`.

## Cómo se contrastó

Un arnés fuera del repositorio cargaba la librería Pro (solo lectura, vía jsdom), generaba
proyectos con distintos tipos de vínculo, lags, duración cero y resúmenes, y comparaba fechas
y ruta crítica con las de este motor. Las diferencias encontradas se corrigieron hasta coincidir:
inicio sin predecesora sin ajustar, tope de la pasada hacia atrás, y reglas de hitos.
El arnés no se incluye porque requiere la licencia Pro; los 30 tests de
`schedule.test.ts` fijan el comportamiento resultante (2026-01-05 es lunes).

## Diferencias conocidas

- Sin calendarios por tarea, restricciones (MSO, SNET, etc.) ni feriados desde la UI
  (el motor ya acepta feriados en `weekCalendar`; falta exponerlos).
- La columna "Días" de tareas resumen muestra días corridos (DHTMLX la recalcula);
  las tareas hoja muestran la duración laboral correcta.
