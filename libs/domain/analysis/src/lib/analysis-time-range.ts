import { Schema } from 'effect';

export const ANALYSIS_TIME_RANGE_MAX_DURATION_MILLISECONDS =
  31 * 24 * 60 * 60 * 1_000;

/**
 * Immutable UTC interval used to select Analysis Run source messages.
 *
 * The start is inclusive and the end is exclusive. A range must be positive
 * and cannot exceed 31 days; whether its end is in the future is checked by
 * the start use case because that rule requires the current clock.
 */
export const AnalysisTimeRangeSchema = Schema.Struct({
  start: Schema.ValidDateFromSelf,
  end: Schema.ValidDateFromSelf,
}).pipe(
  Schema.filter((range) => range.start.getTime() < range.end.getTime(), {
    message: () => 'An analysis time range must end after it starts.',
  }),
  Schema.filter(
    (range) =>
      range.end.getTime() - range.start.getTime() <=
      ANALYSIS_TIME_RANGE_MAX_DURATION_MILLISECONDS,
    {
      message: () => 'An analysis time range cannot exceed 31 days.',
    }
  )
);

export type AnalysisTimeRange = typeof AnalysisTimeRangeSchema.Type;
