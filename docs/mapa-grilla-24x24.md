# Mapa de sectores: grilla 24×24

La posición de cada sector y del escenario se guarda como celdas de una grilla
fija de 24×24 (índices 1-based). Es la única fuente de verdad. La `geometry` en
coordenadas 0..1 quedó deprecada: el servidor la calcula a partir de las celdas
y solo la devuelve por compatibilidad.

## Contrato

```ts
type MapGridCell = { col: number; row: number; colSpan: number; rowSpan: number };

type MapSectorLayout =
  | { kind: 'rect'; cell: MapGridCell }        // bloque sólido
  | { kind: 'cells'; cells: MapGridCell[] };   // forma libre, solo celdas 1×1
```

### `PUT /events/:eventUuid/map`

```jsonc
{
  "analysis": { ... },                 // opcional, metadatos del editor
  "stageLayout": { "kind": "rect", "cell": { "col": 2, "row": 1, "colSpan": 22, "rowSpan": 2 } },
  "sectors": [
    {
      "name": "FANS 4 LIFE",
      "layout": { "kind": "cells", "cells": [{ "col": 4, "row": 4, "colSpan": 1, "rowSpan": 1 }] },
      "color": "#c8004a",
      "ticketTypeUuids": []
    }
  ]
}
```

- `layout` es obligatorio en cada sector.
- `stageLayout`: si no se manda, se conserva el que ya estaba guardado; con `null` vuelve al valor por defecto (según `analysis.stage.position`).
- Si llega un sector llamado "ESCENARIO" sin tandas, se toma como escenario y se saca de la lista de sectores.
- Responde **400** cuando:
  - una celda queda fuera de 1..24 o los índices no son enteros;
  - un layout `cells` trae celdas que no son 1×1 o celdas repetidas;
  - dos sectores comparten una celda, o un sector pisa el escenario. El mensaje indica qué sectores chocan y en qué celda.

### Respuesta (`GET` / `PUT`)

Mapa: `uuid`, `eventUuid`, `name`, `baseImageUrl`, `grid: { cols: 24, rows: 24 }`,
`stageLayout`, `needsReanalysis`, `sectors[]`, `ticketTypes[]`, `analysis`.

Sector: `uuid`, `name`, `level`, `layout` (fuente de verdad), `color`,
`sortOrder`, `isNumbered`, `capacity`, `ticketTypeUuids`, `activeTicketTypeUuid`.

Ya no se exponen: `sectors[].geometry`, `canvasWidth`, `canvasHeight`.

### `analysis` (forma canónica, `core/map-grid-analysis.ts`)

Se limpia al guardar y al leer (los datos viejos también salen limpios):

- `grid`
- `categories[]`: `id`, `label`, `detectedPrice`, `elementType`, `saleMode`, `selectionUnit`, `detectedCapacity`, `includedAdmissions`, `color`
- `layout.groups[]`: `id`, `elementType`, `layoutType`, `labels`, `category`, `categoryAssignments`, `count`, `cell`, más:
  - `unitCells` (una por label);
  - `footprintCells` solo si la zona no es un rectángulo sólido (en ese caso `cell` es su bounding box);
  - `ordering` / `rows` / `columns` si existen;
  - `shape` / `shapeNotch` solo si no es rect y no hay footprint;
  - `labelOrientation` solo si es `vertical`;
  - `level` si existe.
- `stage`: solo `visible` y `position` (inferida de `stageLayout`). Las celdas del escenario están únicamente en `stageLayout`.

Se descartan `box`, `outline`, `lane`, `stackOrder`, `containedBy/At`, pesos,
`requiresGeometryFallback`, `confidence`, `mapArea`, `stage.box/outline/inferred/alignment/entranceAt`
y el `layout` duplicado por grupo. `cell` siempre se recalcula desde `unitCells`/`footprintCells`,
así no puede quedar desfasado.

El análisis (`POST /events/ai/from-map`) devuelve la misma forma más
`stageLayout` y `mapArea` (recorte del plano en el flyer).

### Análisis IA (`POST /events/ai/from-map`)

Una sola request síncrona: subís la imagen y la respuesta trae el layout completo
(típico ~20–40s con `EVENT_AI_MAP_REASONING_EFFORT=low`). Sin polling.

Pipeline (`EventAiService.analyzeSalesMap`):

1. **Visión** (`EVENT_AI_MAP_MODEL`): el modelo devuelve solo estructura + bbox en celdas. Por grupo manda `id`, `elementType`, `layoutType`, `labels`, `count`, `cell`, `rows`/`columns`/`ordering`, `category`, `categoryAssignments` y, cuando corresponde, `footprintCells` + `shape` (L/U), `labelOrientation` (vertical) y `level`. **No manda `unitCells`**: 50 mesas eran 50 objetos de salida y salían de distinto tamaño.
2. **Normalizar**: con `count = labels.length`, lee `stageLayout` y completa las asignaciones de categoría hasta cubrir todos los labels.
3. **Verificar**:
   - Problemas que requieren visión (`VISION_REPAIR_CODES`): `DECLARED_COUNT_MISMATCH`, `GRID_SHAPE_MISMATCH` (grilla con más lugares que labels), `CATEGORY_WITHOUT_GROUP` y `DUPLICATE_LABEL`.
   - Problemas estructurales, que se resuelven en código: `MISSING_GROUP_CELLS` y `CELL_OVERLAP`.
4. **Reparación con visión, condicional**: corre **solo** si hay algún problema que requiere visión.
   - Modelo: `EVENT_AI_MAP_REPAIR_MODEL` (vacío = el mismo del análisis), con `EVENT_AI_MAP_REPAIR_REASONING_EFFORT` (default `low`).
   - Entrada mínima: los grupos afectados completos y, del resto, solo `id` + `cell`. Los labels de todos los grupos van únicamente cuando hay pisos duplicados.
   - Si el verificador no encuentra problemas de ese tipo, no se hace una segunda llamada.
5. **Determinístico** (`fixStructuralIssues` + `rasterizeMapAnalysis`):
   - Re-dimensiona las grillas incoherentes.
   - **Genera `unitCells` uniformes** (grid/column/row) repartiendo `cell` según `rows`/`columns`/`ordering`, e ignora las que haya mandado el modelo. Las zonas quedan con `unitCells = [cell]`, y las L/U usan `footprintCells`.
   - **Unifica el tamaño de unidad por categoría**: todos los grupos de la misma `category` (p. ej. palcos left/right/bottom) comparten el mismo `colSpan×rowSpan` por unidad (el más chico observado, para no agrandar y pisar vecinos).
   - **Tetris L**: si dos zonas quedan apiladas con el mismo ancho y la de arriba es una banda fina (`rowSpan ≤ 2`) y más cara (p. ej. VIP sobre FANS), se anida el premium en el notch (`top_right`), se expande el wrap al union y el pack talla el `footprintCells` en L. No anida wraps altos dentro de CAMPO (FANS→CAMPO). No aplica a bandas de la misma altura (SUPER PULLMAN / PULLMAN).
   - Resuelve los solapes con el pack tipo Tetris.
6. **Log**: `[MAP] Timing: total_ms analyze_ms normalize_ms verify_ms repair_ms raster_ms fixed_grids …`. Cada corrida queda registrada en `event_ai_map_run`.

La respuesta tiene la forma canónica, más `stageLayout` y `mapArea`.
`GET /events/ai/from-map/:jobId` quedó deprecado (compatibilidad con jobs viejos).

## Migración `1789700000000-EventMapGridLayout`

1. Agrega las columnas `event_map_sector.layout` y `color`, y `event_map.stageLayout` y `needsReanalysis`. `geometry` pasa a aceptar NULL.
2. Pasa cada geometría vieja a la grilla: los rectángulos se redondean al borde de celda más cercano y los polígonos se convierten en las celdas cuyo centro queda adentro.
3. Si el mapa tenía un sector "ESCENARIO", sus celdas pasan a `stageLayout` y la fila se borra. Si no, el escenario se toma de `analysis.stage` o del valor por defecto.
4. Resuelve los solapes con el pack: los sectores chicos se ubican primero y los grandes ceden celdas. Si queda algún solape sin resolver, el mapa se marca con `needsReanalysis = 1`.

## Código

- Núcleo (sin Nest, lo usa también la migración): `src/modules/event/services/core/map-grid.ts`
- Rasterizado del análisis: `src/modules/event/services/implementation/map-grid-rasterizer.ts`
- Frontend: `src/lib/events/sector-layout.ts`
