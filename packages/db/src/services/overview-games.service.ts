/**
 * Per-game breakdown for the overview "Games" widget (fork-only).
 *
 * One row per resolved game key, with the metrics stakeholders compare games on
 * — reach (players / sessions), volume (puzzles opened), quality (completion
 * rate), loyalty (returning rate) and effort (median time to solve) — plus a
 * daily series per row for the sparkline.
 *
 * Fork-safe: its own file, appended endpoint. Upstream's overview.service.ts is
 * untouched apart from the constants it already owns (see below).
 *
 * Two queries rather than one, deliberately. PostHog folds a breakdown's
 * per-row series into the aggregate query with a CTE chain, which works because
 * its row totals are sums of the daily values. Ours are not: `players` and
 * `sessions` are distinct counts over the whole range, and summing per-day
 * uniques would count a player who returned on five days five times. The two
 * grains therefore need two aggregations; they run in parallel and are cached
 * by the router.
 *
 * Cost scales with the project, so measure against the biggest one rather than a
 * median. On a 4.7M-row project the pair is ~55-85ms; on daily-mail (22M rows /
 * 30d) it was 2.65s for a 30d window and 5.91s for 12m before the two fixes
 * below — the properties-Map read for the median (worth 1.35s of the 2.65s,
 * removed by materializing time_seconds in code-migration 21) and the daily
 * series scanning event names it never aggregates.
 *
 * This widget is third on the overview and is not deferred to viewport (it sits
 * above the fold), so its cost lands squarely in the cold-load burst that the
 * widget config elsewhere works to keep clear. Anything added here should read
 * materialized columns, never `properties`.
 */
import type { IChartEventFilter } from '@openpanel/validation';
import { ch, TABLE_NAMES } from '../clickhouse/client';
import { clix } from '../clickhouse/query-builder';
import { overviewService } from './overview.service';

// The resolved game key and puzzle-open identity. Mirrors GAME_KEY_EXPR /
// PUZZLE_OPEN_KEY in overview.service.ts — kept as local copies. If the upstream
// definitions ever change, these must change with them.
//
// These were originally copied to keep this fork-only file free of any import
// edge into an upstream-tracked module. That is no longer the goal: the file now
// imports overviewService for getRawWhereClause, because the widget has to honour
// the same dashboard filters every other overview query does, and reimplementing
// the filter whitelist here would be a far worse kind of duplication. The edge is
// deliberate and narrow — one call, to a method the fork already modifies (it
// carries the GAME_KEY_FILTER branch). Note the trade it makes: an upstream
// rename of getRawWhereClause breaks this file at compile time rather than
// surfacing as a merge conflict, so it will not announce itself in a pull.
const GAME_KEY_EXPR = "if(game_tag != '', game_tag, game_id)";
const PUZZLE_OPEN_KEY = 'session_id, level_id';

// Solve time rides on level_completed only, and only since 2026-03-14 (verified
// on prod: 0% coverage before, ~100% after). It is therefore time-to-solve on
// FINISHED puzzles — abandoned attempts contribute nothing, and a range that
// starts before the cutover will under-report. Never present it as "time spent
// on the game".
//
// Reads the materialized `time_seconds` column (code-migration 21), not
// properties['time_seconds']: the Map read decompresses the whole map per row
// and was over half this widget's cost on prod (daily-mail 30d: 2.65s -> 1.30s
// once it is a column). Same reasoning as game_id / game_tag / level_id before
// it — see migrations 18/19/20.
//
// The presence test is `!= 0` rather than the old `!= ''`. The column cannot
// tell a missing property from a literal '0', but a zero-second solve is not a
// real solve either way, and the string is literally '0' on 20 of 2.53M
// level_completed events over 30d on prod.
const SOLVE_SECONDS = 'time_seconds';
const HAS_SOLVE_SECONDS = `name = 'level_completed' AND ${SOLVE_SECONDS} != 0`;

// Events that carry a game identity at ~100% — re-verified on prod over 30d:
// level_started 100.0%, level_completed 100.0%, session_started 100.0%.
// The built-in `session_start` is excluded on purpose: only 68.9% of them carry
// a game, a structural gap that is stable across 9 weeks, so including it would
// silently undercount every per-game figure by about a third. Note this is a
// different event from the Puzzlr-emitted `session_started` below, which is the
// one the returning-rate numerator and denominator both count.
//
// Only getTotals needs the full set; the daily series reads level_started alone.
const GAME_BEARING_EVENTS = [
  'level_started',
  'level_completed',
  'session_started',
];

/**
 * Games shown by name before the remainder is folded into a single "Other" row.
 * Real projects range from 6 to 33 distinct game keys (prod, 30d), so the cap is
 * load-bearing, not hypothetical — but the remainder is always surfaced rather
 * than dropped.
 */
const MAX_NAMED_GAME_ROWS = 12;

/**
 * Above MAX_NAMED_GAME_ROWS the tail is folded, but one row of overshoot is left
 * alone: folding a *single* game into "Other" costs more than it saves. That row
 * loses its name, its players, its sessions and its median (none of which
 * survive the fold — see IGameBreakdownRow) and buys back nothing, and it reads
 * as "Other (1 games)". Measured on prod, this is not a corner case: of the two
 * projects that exceed the cap at all, daily-mail has exactly 13 playable game
 * keys. So a 13th game is shown as itself, and folding starts at 14.
 */
const MAX_GAME_ROWS_BEFORE_FOLD = MAX_NAMED_GAME_ROWS + 1;

export type IGameBreakdownRow = {
  game: string;
  players: number;
  sessions: number;
  opens: number;
  completes: number;
  completion_rate: number;
  returning_rate: number;
  median_solve_s: number;
  /** Daily puzzle-opens, one entry per day in range, gap-filled. */
  series: number[];
  /**
   * True for the synthetic "Other" row. Its players/sessions/median are not
   * derivable by summing per-game rows (distinct counts and a median do not
   * add up), so the UI must render them as unavailable rather than as zero.
   */
  is_other?: boolean;
  /** Number of games folded into this row. Only set when is_other. */
  other_count?: number;
};

export type IGameBreakdown = {
  rows: IGameBreakdownRow[];
  /**
   * Game keys seen in range that never had a puzzle opened — leaderboard/profile
   * surfaces that carry a game tag but are not playable. Excluded from the rows,
   * reported here so the exclusion is visible instead of silent.
   */
  nonPlayableCount: number;
};

type GameBreakdownInput = {
  projectId: string;
  filters: IChartEventFilter[];
  startDate: string;
  endDate: string;
  timezone: string;
};

class OverviewGamesService {
  constructor(private client: typeof ch) {}

  async getGameBreakdown({
    projectId,
    filters,
    startDate,
    endDate,
    timezone,
  }: GameBreakdownInput): Promise<IGameBreakdown> {
    const [totals, series] = await Promise.all([
      this.getTotals({ projectId, filters, startDate, endDate, timezone }),
      this.getDailySeries({ projectId, filters, startDate, endDate, timezone }),
    ]);

    const seriesByGame = new Map(series.map((s) => [s.game, s.series]));

    // A game key with no puzzle opened in range is a non-playable surface
    // (leaderboard, profile). Counted, not listed — and not folded into "Other",
    // which is about games that lost the ranking, not about non-games.
    const playable = totals.filter((t) => t.opens > 0);
    const nonPlayableCount = totals.length - playable.length;

    const ranked = playable.map((t) => ({
      game: t.game,
      players: t.players,
      sessions: t.sessions,
      opens: t.opens,
      completes: t.completes,
      // Uncapped on purpose: a rate above 100% would mean the dedup key is
      // broken, and clamping would hide that behind a flattering number.
      completion_rate: t.opens > 0 ? (t.completes * 100) / t.opens : 0,
      returning_rate:
        t.game_starts > 0 ? (t.returning_starts * 100) / t.game_starts : 0,
      // quantileIf returns null when a game has no timed completions at all
      // (measured: pinpoint emits level_completed without time_seconds). 0 is
      // the "unknown" sentinel the UI renders as an em dash, never as "0s".
      median_solve_s: t.median_solve_s ?? 0,
      series: seriesByGame.get(t.game) ?? [],
    }));

    return { rows: foldTail(ranked), nonPlayableCount };
  }

  /** Range-level aggregates. Distinct counts here cannot come from daily rows. */
  private getTotals({
    projectId,
    filters,
    startDate,
    endDate,
    timezone,
  }: GameBreakdownInput) {
    return clix(this.client, timezone)
      .select<{
        game: string;
        players: number;
        sessions: number;
        opens: number;
        completes: number;
        returning_starts: number;
        game_starts: number;
        median_solve_s: number;
      }>([
        `${GAME_KEY_EXPR} AS game`,
        'uniqExact(device_id) AS players',
        'uniqExact(session_id) AS sessions',
        `uniqExactIf((${PUZZLE_OPEN_KEY}), name = 'level_started') AS opens`,
        `uniqExactIf((${PUZZLE_OPEN_KEY}), name = 'level_completed') AS completes`,
        `countIf(name = 'session_started' AND days_since_first_visit > 0) AS returning_starts`,
        `countIf(name = 'session_started') AS game_starts`,
        `round(quantileIf(0.5)(${SOLVE_SECONDS}, ${HAS_SOLVE_SECONDS})) AS median_solve_s`,
      ])
      .from(TABLE_NAMES.events, false)
      .where('project_id', '=', projectId)
      .where('name', 'IN', GAME_BEARING_EVENTS)
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .rawWhere(overviewService.getRawWhereClause('events', filters))
      .rawWhere(`${GAME_KEY_EXPR} != ''`)
      .groupBy(['game'])
      .orderBy('opens', 'DESC')
      .execute();
  }

  /**
   * Daily puzzle-opens per game, aligned so every row's array has the same
   * length and the same day at the same index.
   *
   * Alignment is the whole point. Without it a game that launched mid-range
   * returns fewer points than its peers, and the sparkline stretches that short
   * series across the full width — so a game live for 17 of 30 days reads as if
   * it ran all month (measured: wordbetween 17/30, bimaru 19/30 on a July
   * window). Leading zeros show the launch honestly.
   *
   * The densification happens in TypeScript rather than via ClickHouse's
   * `WITH FILL`. Both give the same guarantee, but the SQL route has to survive
   * three interacting date semantics — clix.datetime() round-trips a naive local
   * string through Date/ISO, execute() then reinterprets it under
   * session_timezone, and WITH FILL's TO bound is exclusive — which together
   * produced partial stub buckets at BOTH ends (measured: 32 buckets for a
   * 31-day window, first bucket 109 opens against a ~1150 daily norm). Building
   * the expected day list here is a few lines, is exact, and is testable without
   * a database.
   */
  private async getDailySeries({
    projectId,
    filters,
    startDate,
    endDate,
    timezone,
  }: GameBreakdownInput) {
    const days = expectedDays(startDate, endDate);
    const dayIndex = new Map(days.map((d, i) => [d, i]));

    const rows = await clix(this.client, timezone)
      .select<{ game: string; date: string; opens: number }>([
        `${GAME_KEY_EXPR} AS game`,
        `${clix.toStartOf('created_at', 'day', timezone)} AS date`,
        `uniqExact((${PUZZLE_OPEN_KEY})) AS opens`,
      ])
      .from(TABLE_NAMES.events, false)
      .where('project_id', '=', projectId)
      // Only level_started, not the full GAME_BEARING_EVENTS set the totals
      // query needs: the other two names contribute nothing to this aggregate,
      // so scanning them was pure cost (prod daily-mail 30d: 0.59s -> 0.47s).
      .where('name', '=', 'level_started')
      .where('created_at', 'BETWEEN', [
        clix.datetime(startDate, 'toDateTime'),
        clix.datetime(endDate, 'toDateTime'),
      ])
      .rawWhere(overviewService.getRawWhereClause('events', filters))
      .rawWhere(`${GAME_KEY_EXPR} != ''`)
      .groupBy(['game', 'date'])
      .execute();

    const byGame = new Map<string, number[]>();
    for (const row of rows) {
      // clix renders the day bucket as a datetime; the leading 10 chars are the
      // local calendar day, which is the key the expected list is built on.
      const key = String(row.date).slice(0, 10);
      const i = dayIndex.get(key);
      // Buckets outside the expected window are the timezone-shift artefacts
      // described above — a sliver of a day that is not really in range — so
      // they are dropped rather than drawn as a dip. Note this is NOT the same
      // as the final day being incomplete: when the range ends "today", that
      // last point is real data for a day still in progress and is kept, exactly
      // as the metric cards and their charts above it do.
      if (i === undefined) {
        continue;
      }
      let series = byGame.get(row.game);
      if (!series) {
        series = new Array(days.length).fill(0);
        byGame.set(row.game, series);
      }
      series[i] = row.opens ?? 0;
    }

    return [...byGame.entries()].map(([game, series]) => ({ game, series }));
  }
}

/**
 * Caps the table at MAX_GAME_ROWS_BEFORE_FOLD rows, folding whatever the cap cuts
 * off into a single synthetic "Other" row. Rows must already be ranked (the
 * server orders by opens DESC), since the fold takes the tail as given.
 *
 * Only the additive measures survive the fold. Distinct counts and a median
 * cannot be summed across games, so players / sessions / returning / median are
 * emitted as 0 and rendered as "n/a" — see IGameBreakdownRow.is_other. That loss
 * is the whole reason the cap tolerates one row of overshoot; see
 * MAX_GAME_ROWS_BEFORE_FOLD.
 *
 * Exported for tests.
 */
export function foldTail(ranked: IGameBreakdownRow[]): IGameBreakdownRow[] {
  if (ranked.length <= MAX_GAME_ROWS_BEFORE_FOLD) {
    return ranked;
  }

  const shown = ranked.slice(0, MAX_NAMED_GAME_ROWS);
  const rest = ranked.slice(MAX_NAMED_GAME_ROWS);

  const otherOpens = rest.reduce((sum, r) => sum + r.opens, 0);
  const otherCompletes = rest.reduce((sum, r) => sum + r.completes, 0);
  // Index-aligned across rows by construction (see getDailySeries), so summing
  // position i across the tail is summing the same day across the tail.
  const seriesLength = shown[0]?.series.length ?? 0;
  const otherSeries = Array.from({ length: seriesLength }, (_, i) =>
    rest.reduce((sum, r) => sum + (r.series[i] ?? 0), 0)
  );

  return [
    ...shown,
    {
      game: 'Other',
      players: 0,
      sessions: 0,
      opens: otherOpens,
      completes: otherCompletes,
      completion_rate: otherOpens > 0 ? (otherCompletes * 100) / otherOpens : 0,
      returning_rate: 0,
      median_solve_s: 0,
      series: otherSeries,
      is_other: true,
      other_count: rest.length,
    },
  ];
}

/**
 * The local calendar days a range covers, as 'YYYY-MM-DD', inclusive of the
 * first and last day that actually has data.
 *
 * Bounds arrive as naive local datetime strings ('2026-07-01 00:00:00'), already
 * resolved for the project timezone by getChartStartEndDate. They are treated as
 * plain text here — parsing them into Date would reintroduce exactly the UTC
 * round-trip that produced the stub buckets.
 *
 * A range ending exactly at midnight is a half-open bound: '30d' resolves to
 * 2026-07-01 00:00:00 → 2026-08-01 00:00:00 and means 1–31 July, so the final
 * day is dropped. Any other end time means the last day is partially elapsed
 * (a live "today"), and it is kept.
 *
 * Exported for tests.
 */
export function expectedDays(startDate: string, endDate: string): string[] {
  const startDay = startDate.slice(0, 10);
  const endDay = endDate.slice(0, 10);
  const endIsMidnightBoundary = endDate.slice(11, 19) === '00:00:00';

  const days: string[] = [];
  // Step in UTC on date-only values: no timezone is involved, so DST cannot
  // shift or duplicate a day the way local-time arithmetic would.
  const cursor = new Date(`${startDay}T00:00:00Z`);
  const last = new Date(`${endDay}T00:00:00Z`);
  if (endIsMidnightBoundary) {
    last.setUTCDate(last.getUTCDate() - 1);
  }

  // Guard against an inverted or absurd range producing an unbounded loop.
  const MAX_DAYS = 400;
  while (cursor <= last && days.length < MAX_DAYS) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return days;
}

export const overviewGamesService = new OverviewGamesService(ch);
