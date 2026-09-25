import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  MapGridCell,
  MapSectorLayout,
  clampCell,
  layoutArea,
  layoutKeys,
  packLayouts
} from '../modules/event/services/core/map-grid';

/**
 * Achica la grilla de mapas de 48x48 a 24x24 (factor exacto /2).
 *
 * Este cambio va SIEMPRE junto con bajar `MAP_GRID_SIZE` (backend,
 * `core/map-grid.ts`) y `MAP_CELL_CANVAS` (frontend, `lib/api/events.ts`)
 * de 48 a 24 en el MISMO deploy. Si se corre esta migracion sin bajar esas
 * dos constantes, o se bajan sin correr esta migracion, los mapas quedan
 * mal ubicados: cada celda se lee al doble de su posicion real. Ya paso
 * una vez probando esto en caliente y se revirtio.
 *
 * Recalcula cada celda guardada (/2, redondeando al entero mas cercano) y
 * resuelve con el mismo pack tipo Tetris que uso la migracion
 * `EventMapGridLayout1789700000000` los solapes que el redondeo pueda
 * generar entre sectores vecinos. Lo que no se puede resolver automatico
 * queda marcado con `needsReanalysis = 1` (mismo criterio que esa
 * migracion), asi el mapa se puede reabrir y corregir a mano o volver a
 * pasar por la IA en vez de quedar roto en silencio.
 *
 * Es un cambio con perdida en un sentido: redondear 1 celda vieja (de 48)
 * a un valor exacto de la grilla nueva (de 24) puede fusionar dos celdas
 * 1x1 vecinas en una sola. El `down()` multiplica x2 de vuelta: es exacto
 * para posicion y tamano, pero no puede reconstruir una celda que el `up()`
 * haya fusionado con otra.
 */
export class ShrinkMapGridTo241790400000000 implements MigrationInterface {
  name = 'ShrinkMapGridTo241790400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const FACTOR = 2; // 48 -> 24, exacto

    const rescaleCell = (cell: MapGridCell): MapGridCell => {
      const col = Math.max(1, Math.round((cell.col - 1) / FACTOR) + 1);
      const row = Math.max(1, Math.round((cell.row - 1) / FACTOR) + 1);
      const colSpan = Math.max(1, Math.round(cell.colSpan / FACTOR));
      const rowSpan = Math.max(1, Math.round(cell.rowSpan / FACTOR));
      return clampCell({ col, row, colSpan, rowSpan });
    };

    const rescaleLayout = (layout: MapSectorLayout): MapSectorLayout => {
      if (layout.kind === 'rect') {
        return { kind: 'rect', cell: rescaleCell(layout.cell) };
      }
      const seen = new Set<string>();
      const cells: MapGridCell[] = [];
      for (const cell of layout.cells) {
        const scaled = rescaleCell(cell);
        const key = `${scaled.col}:${scaled.row}`;
        // Dos celdas 1x1 vecinas en la grilla vieja pueden redondear a la
        // misma celda en la nueva: se colapsan en una sola en vez de
        // duplicarse (una forma libre no puede repetir celda).
        if (seen.has(key)) continue;
        seen.add(key);
        cells.push(scaled);
      }
      return { kind: 'cells', cells };
    };

    const maps = (await queryRunner.query(
      'SELECT `uuid`, `stageLayout` FROM `event_map`'
    )) as Array<{ uuid: string; stageLayout: unknown }>;

    for (const map of maps) {
      const stageLayoutRaw = parseJson(map.stageLayout) as MapSectorLayout | null;
      const stageLayout = stageLayoutRaw ? rescaleLayout(stageLayoutRaw) : null;

      const rows = (await queryRunner.query(
        'SELECT `uuid`, `name`, `layout` FROM `event_map_sector` WHERE `mapUuid` = ? ORDER BY `sortOrder`, `createdAt`',
        [map.uuid]
      )) as Array<{ uuid: string; name: string; layout: unknown }>;

      const scaled: Array<{ uuid: string; name: string; layout: MapSectorLayout }> = [];
      for (const row of rows) {
        const layoutRaw = parseJson(row.layout) as MapSectorLayout | null;
        if (!layoutRaw) continue;
        scaled.push({ uuid: row.uuid, name: row.name, layout: rescaleLayout(layoutRaw) });
      }

      // Mismo criterio que la migracion anterior: chicos primero, el
      // escenario bloqueado, y lo que no entra queda marcado.
      const ordered = [...scaled].sort((a, b) => layoutArea(a.layout) - layoutArea(b.layout));
      const blocked = new Set(stageLayout ? layoutKeys(stageLayout) : []);
      const packed = packLayouts(
        ordered.map(s => ({ id: s.uuid, label: s.name, layout: s.layout })),
        blocked
      );

      for (const s of scaled) {
        const layout = packed.layouts.get(s.uuid) ?? s.layout;
        await queryRunner.query('UPDATE `event_map_sector` SET `layout` = ? WHERE `uuid` = ?', [
          JSON.stringify(layout),
          s.uuid
        ]);
      }

      await queryRunner.query('UPDATE `event_map` SET `stageLayout` = ? WHERE `uuid` = ?', [
        stageLayout ? JSON.stringify(stageLayout) : null,
        map.uuid
      ]);
      if (packed.unresolved.length) {
        await queryRunner.query('UPDATE `event_map` SET `needsReanalysis` = 1 WHERE `uuid` = ?', [
          map.uuid
        ]);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const FACTOR = 2; // 24 -> 48, exacto, sin perdida de posicion/tamano

    const upscaleCell = (cell: MapGridCell): MapGridCell => ({
      col: (cell.col - 1) * FACTOR + 1,
      row: (cell.row - 1) * FACTOR + 1,
      colSpan: cell.colSpan * FACTOR,
      rowSpan: cell.rowSpan * FACTOR
    });

    const upscaleLayout = (layout: MapSectorLayout): MapSectorLayout =>
      layout.kind === 'rect'
        ? { kind: 'rect', cell: upscaleCell(layout.cell) }
        : { kind: 'cells', cells: layout.cells.map(upscaleCell) };

    const maps = (await queryRunner.query(
      'SELECT `uuid`, `stageLayout` FROM `event_map`'
    )) as Array<{ uuid: string; stageLayout: unknown }>;

    for (const map of maps) {
      const stageLayoutRaw = parseJson(map.stageLayout) as MapSectorLayout | null;
      if (stageLayoutRaw) {
        await queryRunner.query('UPDATE `event_map` SET `stageLayout` = ? WHERE `uuid` = ?', [
          JSON.stringify(upscaleLayout(stageLayoutRaw)),
          map.uuid
        ]);
      }

      const rows = (await queryRunner.query(
        'SELECT `uuid`, `layout` FROM `event_map_sector` WHERE `mapUuid` = ?',
        [map.uuid]
      )) as Array<{ uuid: string; layout: unknown }>;

      for (const row of rows) {
        const layoutRaw = parseJson(row.layout) as MapSectorLayout | null;
        if (!layoutRaw) continue;
        await queryRunner.query('UPDATE `event_map_sector` SET `layout` = ? WHERE `uuid` = ?', [
          JSON.stringify(upscaleLayout(layoutRaw)),
          row.uuid
        ]);
      }
    }
  }
}

/** mysql2 devuelve las columnas json ya parseadas, pero no siempre. */
function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value ?? null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
