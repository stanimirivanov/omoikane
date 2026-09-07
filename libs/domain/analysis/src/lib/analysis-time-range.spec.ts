import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import {
  ANALYSIS_TIME_RANGE_MAX_DURATION_MILLISECONDS,
  AnalysisTimeRangeSchema,
} from './analysis-time-range';

const decode = Schema.decodeUnknownSync(AnalysisTimeRangeSchema);

describe('AnalysisTimeRangeSchema', () => {
  it('accepts an inclusive-start, exclusive-end 31-day range', () => {
    const start = new Date('2026-07-01T00:00:00.000Z');
    const end = new Date(
      start.getTime() + ANALYSIS_TIME_RANGE_MAX_DURATION_MILLISECONDS
    );

    expect(decode({ start, end })).toEqual({ start, end });
  });

  it.each([
    ['empty', '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z'],
    ['reversed', '2026-07-02T00:00:00.000Z', '2026-07-01T00:00:00.000Z'],
    ['oversized', '2026-07-01T00:00:00.000Z', '2026-08-01T00:00:00.001Z'],
  ])('rejects an %s range', (_kind, start, end) => {
    expect(() =>
      decode({ start: new Date(start), end: new Date(end) })
    ).toThrow();
  });

  it('rejects invalid dates', () => {
    expect(() =>
      decode({ start: new Date('invalid'), end: new Date() })
    ).toThrow();
  });
});
