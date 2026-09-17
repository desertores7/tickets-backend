import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  MapSectorLayout,
  isStageSectorName,
  layoutArea,
  layoutKeys,
  layoutToLegacyGeometry,
  packLayouts,
  snapLegacyGeometry,
  stageLayoutFromAnalysis
} from '../modules/event/services/core/map-grid';

/**
 * Mapa de sectores: de coordenadas 0..1 a grilla fija 24×24.
 *
 * - `event_map_sector.layout` pasa a ser la fuente de verdad; `geometry` queda
 *   nullable y solo como derivado legacy. `color` sale de `geometry`.
 * - `event_map.stageLayout`: celdas del escenario.
 * - `event_map.needsReanalysis`: el snap dejó solapes que el pack no resolvió.
 *
 * Compatible con el código anterior: solo agrega columnas y afloja
 * `geometry` a NULL (el código viejo la sigue escribiendo siempre).
 *
 * El sector "ESCENARIO" que guardaba el editor se convierte en `stageLayout`
 * y se borra (no tiene tandas; ya no es un sector).
 *
 * Datos: cada geometría vieja se rasteriza a la grilla, el escenario sale del
 * `analysis` guardado (o del default por posición) y los solapes se corrigen
 * con el pack tipo Tetris. Lo que no entra se marca para re-análisis.
 */
export class EventMapGridLayout1789700000000 implements MigrationInterface {
  name = 'EventMapGridLayout1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`event_map_sector\`
      ADD COLUMN \`layout\` json NULL DEFAULT NULL AFTER \`level\`,
      MODIFY COLUMN \`geometry\` json NULL DEFAULT NULL,
      ADD COLUMN \`color\` varchar(32) NULL DEFAULT NULL AFTER \`geometry\`
    `);
    await queryRunner.query(`
      ALTER TABLE \`event_map\`
      ADD COLUMN \`stageLayout\` json NULL DEFAULT NULL AFTER \`analysis\`,
      ADD COLUMN \`needsReanalysis\` tinyint(1) NOT NULL DEFAULT 0 AFTER \`stageLayout\`
    `);

    const maps = (await queryRunner.query(
      'SELECT `uuid`, `analysis` FROM `event_map`'
    )) as Array<{ uuid: string; analysis: unknown }>;

    for (const map of maps) {
      const analysis = parseJson(map.analysis);
      let stageLayout = stageLayoutFromAnalysis(analysis);

      const rows = (await queryRunner.query(
        'SELECT `uuid`, `name`, `geometry` FROM `event_map_sector` WHERE `mapUuid` = ? ORDER BY `sortOrder`, `createdAt`',
        [map.uuid]
      )) as Array<{ uuid: string; name: string; geometry: unknown }>;

      const snapped: Array<{ uuid: string; name: string; layout: MapSectorLayout; color: string | null }> = [];
      let needsReanalysis = false;

      // El escenario guardado como sector pasa a `stageLayout` y la fila se
      // borra: ahora vive aparte y ningún sector puede pisarlo.
      const stageRow = rows.find(r => isStageSectorName(r.name));
      const stageFromRow = stageRow ? snapLegacyGeometry(parseJson(stageRow.geometry)) : null;
      if (stageFromRow) stageLayout = stageFromRow;
      for (const row of rows.filter(r => isStageSectorName(r.name))) {
        await queryRunner.query('DELETE FROM `event_map_sector` WHERE `uuid` = ?', [row.uuid]);
      }

      for (const row of rows) {
        if (isStageSectorName(row.name)) continue;
        const geometry = parseJson(row.geometry) as Record<string, unknown> | null;
        const color = typeof geometry?.color === 'string' ? geometry.color.slice(0, 32) : null;
        const layout = snapLegacyGeometry(geometry);
        if (!layout) {
          needsReanalysis = true;
          await queryRunner.query('UPDATE `event_map_sector` SET `color` = ? WHERE `uuid` = ?', [
            color,
            row.uuid
          ]);
          continue;
        }
        snapped.push({ uuid: row.uuid, name: row.name, layout, color });
      }

      // Chicos primero: reclaman sus celdas y las zonas grandes ceden el
      // solape (quedan en L/U) o se corren al hueco libre más cercano.
      const ordered = [...snapped].sort((a, b) => layoutArea(a.layout) - layoutArea(b.layout));
      const blocked = new Set(layoutKeys(stageLayout));
      const packed = packLayouts(
        ordered.map(s => ({ id: s.uuid, label: s.name, layout: s.layout })),
        blocked
      );
      if (packed.unresolved.length) needsReanalysis = true;
      const unresolved = new Set(packed.unresolved);

      for (const s of snapped) {
        const layout = packed.layouts.get(s.uuid) ?? s.layout;
        if (unresolved.has(s.uuid)) {
          // Se guarda el snap igual (se ve en el editor) pero la geometría
          // vieja queda intacta hasta que el mapa se corrija.
          await queryRunner.query(
            'UPDATE `event_map_sector` SET `layout` = ?, `color` = ? WHERE `uuid` = ?',
            [JSON.stringify(layout), s.color, s.uuid]
          );
          continue;
        }
        await queryRunner.query(
          'UPDATE `event_map_sector` SET `layout` = ?, `geometry` = ?, `color` = ? WHERE `uuid` = ?',
          [
            JSON.stringify(layout),
            JSON.stringify(layoutToLegacyGeometry(layout, s.color)),
            s.color,
            s.uuid
          ]
        );
      }

      await queryRunner.query(
        'UPDATE `event_map` SET `stageLayout` = ?, `needsReanalysis` = ? WHERE `uuid` = ?',
        [JSON.stringify(stageLayout), needsReanalysis ? 1 : 0, map.uuid]
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // El código anterior exige geometry: completar las filas que no la tengan.
    const rows = (await queryRunner.query(
      'SELECT `uuid`, `layout`, `color` FROM `event_map_sector` WHERE `geometry` IS NULL'
    )) as Array<{ uuid: string; layout: unknown; color: string | null }>;
    for (const row of rows) {
      const layout = parseJson(row.layout) as MapSectorLayout | null;
      const geometry = layout
        ? layoutToLegacyGeometry(layout, row.color)
        : { type: 'rect', x: 0, y: 0, w: 0.1, h: 0.1 };
      await queryRunner.query('UPDATE `event_map_sector` SET `geometry` = ? WHERE `uuid` = ?', [
        JSON.stringify(geometry),
        row.uuid
      ]);
    }
    await queryRunner.query(`
      ALTER TABLE \`event_map_sector\`
      DROP COLUMN \`layout\`,
      DROP COLUMN \`color\`,
      MODIFY COLUMN \`geometry\` json NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE \`event_map\`
      DROP COLUMN \`stageLayout\`,
      DROP COLUMN \`needsReanalysis\`
    `);
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
