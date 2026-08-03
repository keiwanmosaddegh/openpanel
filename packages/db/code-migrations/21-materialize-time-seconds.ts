import fs from 'node:fs';
import path from 'node:path';
import {
  addColumns,
  runClickhouseMigrationCommands,
} from '../src/clickhouse/migration';
import { getIsCluster } from './helpers';

// time_seconds is the median-solve measure behind the overview Games widget,
// which every load of the client-shared overview reads. It was the last value on
// that path still coming out of the `properties` Map, and reading it there
// decompresses the whole map per row — the same cost migrations 18/19/20 removed
// for game_id, game_tag and level_id.
//
// Measured on prod (daily-mail, 22M rows / 30d) against the widget's own totals
// query: 2.65s with the Map read, 1.30s with the column dropped entirely, so the
// Map access was over half the query. properties is 296 MiB compressed in the
// largest partition (202606) against 22 MiB for level_id.
//
// Float32, not the Float64 the old toFloat64OrZero produced: these are seconds,
// and Float32 is exact for integers to 16,777,216 — comfortably above the
// largest value prod has ever recorded (13,218,629, itself garbage data from a
// client that never closed a puzzle). It halves the column against Float64.
//
// Unlike migrations 19/20 this is deliberately NOT byte-identical to the Map
// expression: ~11% of values are fractional (681,908 of 5.97M over 90d) and
// Float32 rounds those in the 7th significant digit. The consumer is a median
// that is round()ed to whole seconds, so the difference is unobservable —
// verified on prod across all 16 of daily-mail's game keys over 31d, where
// round(quantile) is identical under both types for every row.
//
// Semantics: the caller's presence test becomes `time_seconds != 0` instead of
// `properties['time_seconds'] != ''`, since the column cannot distinguish a
// missing property from a literal '0'. That string occurs on 20 of 2.53M
// level_completed events over 30d, and a zero-second solve is not a real solve,
// so it is now excluded rather than counted as 0.0 in the quantile.
const MATERIALIZED_COLUMNS = ['time_seconds'] as const;

/**
 * Backfills the MATERIALIZED column on pre-existing parts. Async background
 * mutation (CH default) — no table lock; un-rewritten parts compute the column
 * on read until the mutation finishes, so correctness holds throughout. Inline
 * here (not in shared migration.ts) to keep the upstream-merge surface at zero.
 */
function materializeColumns(
  tableName: string,
  columnNames: readonly string[],
  isClustered: boolean,
): string[] {
  // MATERIALIZE targets the local replicated table that holds data, not the
  // Distributed proxy.
  const target = isClustered
    ? `${tableName}_replicated ON CLUSTER '{cluster}'`
    : tableName;

  const actions = columnNames
    .map((col) => `MATERIALIZE COLUMN ${col}`)
    .join(', ');

  return [`ALTER TABLE ${target} ${actions}`];
}

export async function up() {
  const isClustered = getIsCluster();

  const sqls: string[] = [
    ...addColumns(
      'events',
      [
        "`time_seconds` Float32 MATERIALIZED toFloat32OrZero(properties['time_seconds'])",
      ],
      isClustered,
    ),
    ...materializeColumns('events', MATERIALIZED_COLUMNS, isClustered),
  ];

  fs.writeFileSync(
    path.join(import.meta.filename.replace('.ts', '.sql')),
    sqls
      .map((sql) =>
        sql
          .trim()
          .replace(/;$/, '')
          .replace(/\n{2,}/g, '\n')
          .concat(';'),
      )
      .join('\n\n---\n\n'),
  );

  if (!process.argv.includes('--dry')) {
    await runClickhouseMigrationCommands(sqls);
  }
}
