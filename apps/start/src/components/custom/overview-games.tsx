/**
 * Games widget (fork-only) — every game side by side.
 *
 * Answers the question clients actually ask of the shared dashboard: "how do
 * crosswords compare to sudoku?". One row per game, with reach (players,
 * sessions), volume (puzzles opened), quality (completion rate), loyalty
 * (returning rate) and effort (median solve), plus a per-row sparkline of daily
 * opens. Sortable on every column; the whole comparison is on screen at once,
 * which is what makes it screenshot-able into a stakeholder deck.
 *
 * Replaces the earlier half-width Top Games widget (game / started / completed /
 * rate), which this is a strict superset of. Chosen over three alternatives —
 * a global game filter in the header, a per-metric breakout, and a master-detail
 * drill-down — after building all four (2026-07-31). The filter variant lost on
 * a hard data constraint: only 2 of the 7 headline metrics can be scoped to one
 * game honestly (the sessions table has no game column, and session_start
 * carries a game on just ~65% of events), so scoping the page silently leaves
 * three cards unchanged and drives Multi-game sessions to 0% by construction.
 * This widget sidesteps that entirely — every figure in it is natively per-game.
 *
 * Data: overview.gameBreakdown. Share-safe (goes through overviewProcedure).
 */
import { useQuery } from '@tanstack/react-query';
import { useEventQueryFilters } from '@/hooks/use-event-query-filters';
import { useNumber } from '@/hooks/use-numer-formatter';
import { useTRPC } from '@/integrations/trpc/react';
import type { RouterOutputs } from '@/trpc/client';
import { SerieIcon } from '@/components/report-chart/common/serie-icon';
import { Widget, WidgetBody } from '@/components/widget';
import { WidgetFooter, WidgetHead } from '@/components/overview/overview-widget';
import {
  OverviewWidgetTable,
  OverviewWidgetTableLoading,
} from '@/components/overview/overview-widget-table';
import { useOverviewOptions } from '@/components/overview/useOverviewOptions';
import { Tooltiper } from '@/components/ui/tooltip';
import { getChartColor, getChartTranslucentColor } from '@/utils/theme';
import { GameSparkline } from './game-sparkline';

type GameRow = RouterOutputs['overview']['gameBreakdown']['rows'][number];

/**
 * Median seconds → a duration a stakeholder can read at a glance. 0 is the
 * service's "no timed completions" sentinel (a game that emits level_completed
 * without time_seconds), and must never render as "0s".
 */
function formatSolve(seconds: number): string {
  if (!seconds) {
    return '—';
  }
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return secs ? `${mins}m ${secs}s` : `${mins}m`;
}

/** The "Other" row can only carry additive measures — see IGameBreakdownRow. */
function NotApplicable() {
  return (
    <Tooltiper content="Not available for the Other row: a median and a returning rate are not additive, so neither can be derived by summing the games folded into it.">
      <span className="text-muted-foreground">n/a</span>
    </Tooltiper>
  );
}

export default function OverviewGames({
  projectId,
  shareId,
}: {
  projectId: string;
  shareId?: string;
}) {
  const { range, startDate, endDate } = useOverviewOptions();
  const [filters] = useEventQueryFilters();
  const number = useNumber();
  const trpc = useTRPC();

  const query = useQuery(
    trpc.overview.gameBreakdown.queryOptions({
      projectId,
      shareId,
      range,
      startDate,
      endDate,
      filters,
    }),
  );

  const rows = query.data?.rows ?? [];
  const nonPlayableCount = query.data?.nonPlayableCount ?? 0;
  // At most ~13 rows, so plain derivation beats memoization.
  const maxOpens = Math.max(1, ...rows.map((g) => g.opens));
  // One y-domain across every sparkline: scaled per row, a 200/day game would
  // draw the same peak as a 3,000/day one.
  const seriesMax = Math.max(1, ...rows.flatMap((g) => g.series));
  // Colour follows the game, never its position. The table is sortable, so
  // keying off the rendered row index would repaint every sparkline whenever a
  // column header is clicked and "the orange one" would become a different game.
  // The server's order (opens DESC) is the stable assignment.
  const colorByGame = new Map(rows.map((g, i) => [g.game, getChartColor(i)]));
  const fillByGame = new Map(
    rows.map((g, i) => [g.game, getChartTranslucentColor(i)]),
  );
  // Never clamped — a clamp would also hide a genuine dedup regression — so the
  // footer explains it on the rare view where it shows up.
  const hasRateOverHundred = rows.some((g) => g.completion_rate > 100);

  return (
    <Widget className="col-span-6">
      <WidgetHead>
        <div className="title">Games</div>
      </WidgetHead>
      <WidgetBody className="p-0">
        {query.isLoading ? (
          <OverviewWidgetTableLoading />
        ) : (
          <OverviewWidgetTable
            data={rows}
            keyExtractor={(g) => g.game}
            getColumnPercentage={(g) => g.opens / maxOpens}
            columns={[
              {
                name: 'Game',
                width: 'w-full',
                responsive: { priority: 1 },
                getSortValue: (g: GameRow) => g.game,
                render(g: GameRow) {
                  return (
                    <div className="row min-w-0 items-center gap-2">
                      {g.is_other ? (
                        <span className="size-4 shrink-0" />
                      ) : (
                        <SerieIcon name={g.game} />
                      )}
                      <span className="truncate">
                        {g.is_other
                          ? `Other (${g.other_count} games)`
                          : g.game}
                      </span>
                    </div>
                  );
                },
              },
              {
                name: 'Trend',
                width: '120px',
                // First to hide: the sparkline is the one column whose
                // information is fully carried by the numbers beside it.
                responsive: { priority: 6 },
                render: (g: GameRow) => (
                  <GameSparkline
                    color={colorByGame.get(g.game) ?? getChartColor(0)}
                    domainMax={seriesMax}
                    fill={fillByGame.get(g.game) ?? getChartTranslucentColor(0)}
                    label={`Daily puzzles opened for ${g.game}`}
                    values={g.series}
                  />
                ),
              },
              {
                name: 'Opened',
                width: '90px',
                responsive: { priority: 2 },
                getSortValue: (g: GameRow) => g.opens,
                render: (g: GameRow) => (
                  <span className="font-semibold">{number.short(g.opens)}</span>
                ),
              },
              {
                name: 'Completion',
                width: '110px',
                responsive: { priority: 3 },
                getSortValue: (g: GameRow) => g.completion_rate,
                render: (g: GameRow) => (
                  <span className="font-semibold">
                    {Math.round(g.completion_rate)}%
                  </span>
                ),
              },
              {
                name: 'Returning',
                width: '104px',
                responsive: { priority: 4 },
                getSortValue: (g: GameRow) => g.returning_rate,
                render: (g: GameRow) =>
                  g.is_other ? (
                    <NotApplicable />
                  ) : (
                    <span className="font-semibold">
                      {Math.round(g.returning_rate)}%
                    </span>
                  ),
              },
              {
                name: 'Median solve',
                width: '116px',
                responsive: { priority: 5 },
                getSortValue: (g: GameRow) => g.median_solve_s,
                render: (g: GameRow) =>
                  g.is_other ? (
                    <NotApplicable />
                  ) : (
                    <span className="font-semibold">
                      {formatSolve(g.median_solve_s)}
                    </span>
                  ),
              },
            ]}
          />
        )}
      </WidgetBody>
      <WidgetFooter>
        <p className="text-muted-foreground text-xs">
          Median solve is time to finish a completed puzzle, so it excludes
          abandoned attempts.
          {nonPlayableCount > 0 &&
            ` ${nonPlayableCount} non-playable ${
              nonPlayableCount === 1 ? 'surface' : 'surfaces'
            } (leaderboards, profiles) excluded.`}
          {hasRateOverHundred &&
            ' Completion above 100% means more puzzles were finished than' +
              ' opened in this view — either they were opened before the range' +
              ' started, or an active filter matches the two events unevenly.'}
        </p>
      </WidgetFooter>
    </Widget>
  );
}
