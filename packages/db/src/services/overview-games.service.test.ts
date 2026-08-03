import { describe, expect, it } from 'vitest';
import {
  expectedDays,
  foldTail,
  type IGameBreakdownRow,
} from './overview-games.service';

/** A ranked row carrying just enough to make the fold's arithmetic observable. */
function row(
  game: string,
  overrides: Partial<IGameBreakdownRow> = {}
): IGameBreakdownRow {
  return {
    game,
    players: 100,
    sessions: 110,
    opens: 1000,
    completes: 500,
    completion_rate: 50,
    returning_rate: 25,
    median_solve_s: 60,
    series: [1, 2, 3],
    ...overrides,
  };
}

/** `count` ranked rows named game1..gameN. */
function rows(count: number): IGameBreakdownRow[] {
  return Array.from({ length: count }, (_, i) => row(`game${i + 1}`));
}

describe('foldTail', () => {
  it('leaves a table at the cap untouched', () => {
    expect(foldTail(rows(12)).map((r) => r.game)).toEqual(
      rows(12).map((r) => r.game)
    );
  });

  it('shows a 13th game as itself rather than folding one game', () => {
    // The daily-mail case: folding here would cost that game its name, players,
    // sessions and median to buy back nothing, and read "Other (1 games)".
    const result = foldTail(rows(13));

    expect(result).toHaveLength(13);
    expect(result.some((r) => r.is_other)).toBe(false);
    expect(result.at(-1)?.game).toBe('game13');
  });

  it('folds from two games up', () => {
    const result = foldTail(rows(14));

    expect(result).toHaveLength(13);
    expect(result.at(-1)).toMatchObject({
      game: 'Other',
      is_other: true,
      other_count: 2,
    });
  });

  it('never emits an "Other" row for a single game', () => {
    // Guards the plural in the UI's `Other (${other_count} games)`.
    for (let n = 0; n <= 40; n++) {
      const other = foldTail(rows(n)).find((r) => r.is_other);
      expect(other?.other_count ?? 2).toBeGreaterThan(1);
    }
  });

  it('sums only the additive measures across the folded tail', () => {
    const result = foldTail([
      ...rows(12),
      row('tail1', { opens: 300, completes: 90, players: 7, sessions: 9 }),
      row('tail2', { opens: 100, completes: 10, players: 5, sessions: 6 }),
    ]);
    const other = result.at(-1)!;

    expect(other.opens).toBe(400);
    expect(other.completes).toBe(100);
    expect(other.completion_rate).toBe(25);
    // Distinct counts and a median do not add up, so they stay at the 0 the UI
    // renders as "n/a" — never a plausible-looking sum.
    expect(other.players).toBe(0);
    expect(other.sessions).toBe(0);
    expect(other.returning_rate).toBe(0);
    expect(other.median_solve_s).toBe(0);
  });

  it('sums the folded sparkline day by day, keeping the shown length', () => {
    const result = foldTail([
      ...rows(12),
      row('tail1', { series: [1, 0, 5] }),
      row('tail2', { series: [2, 0, 7] }),
    ]);

    expect(result.at(-1)?.series).toEqual([3, 0, 12]);
  });

  it('does not divide by zero when the whole tail has no opens', () => {
    const result = foldTail([
      ...rows(12),
      row('tail1', { opens: 0, completes: 0 }),
      row('tail2', { opens: 0, completes: 0 }),
    ]);

    expect(result.at(-1)?.completion_rate).toBe(0);
  });
});

/**
 * The day list the Games sparkline is densified against. Every case below is a
 * real bound shape produced by getDatesFromRange (date.service.ts) — the two
 * families are ranges that end at `.endOf('day').plus(1ms)` (an exclusive
 * midnight boundary, so the trailing day is not part of the range) and ranges
 * that end at `23:59:59` (an inclusive final day that is kept).
 */
describe('expectedDays', () => {
  it("drops the trailing day of an exclusive midnight bound ('30d')", () => {
    // 30d resolves to today-30 00:00:00 -> tomorrow 00:00:00, and means the 31
    // calendar days today-30..today inclusive.
    const days = expectedDays('2026-07-04 00:00:00', '2026-08-04 00:00:00');

    expect(days).toHaveLength(31);
    expect(days[0]).toBe('2026-07-04');
    expect(days.at(-1)).toBe('2026-08-03');
  });

  it("keeps the final day of an inclusive 23:59:59 bound ('today')", () => {
    expect(expectedDays('2026-08-03 00:00:00', '2026-08-03 23:59:59')).toEqual([
      '2026-08-03',
    ]);
  });

  it("covers a whole calendar month ('lastMonth')", () => {
    const days = expectedDays('2026-07-01 00:00:00', '2026-08-01 00:00:00');

    expect(days).toHaveLength(31);
    expect(days[0]).toBe('2026-07-01');
    expect(days.at(-1)).toBe('2026-07-31');
  });

  it("covers a whole year ('lastYear')", () => {
    const days = expectedDays('2025-01-01 00:00:00', '2025-12-31 23:59:59');

    expect(days).toHaveLength(365);
    expect(days.at(-1)).toBe('2025-12-31');
  });

  it("spans two calendar days for a rolling window ('last24h')", () => {
    expect(expectedDays('2026-08-02 14:23:00', '2026-08-03 14:23:59')).toEqual([
      '2026-08-02',
      '2026-08-03',
    ]);
  });

  it('neither skips nor duplicates a day across a DST transition', () => {
    // Europe/London springs forward on 2026-03-29. Stepping in UTC on date-only
    // values keeps 03-29 present exactly once; local-time arithmetic would not.
    expect(expectedDays('2026-03-28 00:00:00', '2026-03-31 00:00:00')).toEqual([
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
    ]);
  });

  it('crosses a month and a year boundary', () => {
    expect(expectedDays('2025-12-30 00:00:00', '2026-01-02 00:00:00')).toEqual([
      '2025-12-30',
      '2025-12-31',
      '2026-01-01',
    ]);
  });

  it('returns nothing for an inverted range', () => {
    expect(expectedDays('2026-08-03 00:00:00', '2026-07-01 00:00:00')).toEqual(
      []
    );
  });

  it('returns nothing when an exclusive bound collapses the range', () => {
    // 'today' would never produce this, but a caller passing a midnight end on
    // the start day must not yield a phantom day.
    expect(expectedDays('2026-08-03 00:00:00', '2026-08-03 00:00:00')).toEqual(
      []
    );
  });

  it('caps an absurd custom range instead of looping unbounded', () => {
    const days = expectedDays('2020-01-01 00:00:00', '2026-01-01 00:00:00');

    expect(days).toHaveLength(400);
    expect(days[0]).toBe('2020-01-01');
  });
});
