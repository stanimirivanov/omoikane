import { Schema } from 'effect';
import { ProfileIdSchema } from '@omoikane/domain/profile';
import { AnalysisResultSourceSchema } from './analysis-result-source';

const text = (length: number) =>
  Schema.String.pipe(
    Schema.maxLength(length),
    Schema.filter((value) => value.trim().length > 0)
  );
const evidence = Schema.Array(AnalysisResultSourceSchema).pipe(
  Schema.minItems(1),
  Schema.maxItems(100),
  Schema.filter(
    (items) =>
      new Set(items.map((item) => item.messageId)).size === items.length
  )
);
export const DecisionAssertionSchema = Schema.Struct({
  text: text(500),
  evidence,
});

export const DecisionParticipantSchema = Schema.Struct({
  profileId: ProfileIdSchema,
  role: Schema.Literal('proposer', 'decision-maker', 'contributor'),
  evidence,
});

/** Proposed interpretation of conversation evidence; identity and review belong to persistence. */
export const DecisionCandidateSchema = Schema.Struct({
  title: text(120),
  summary: text(1000),
  disposition: Schema.Literal('made', 'deferred', 'changed', 'rejected'),
  claims: Schema.Array(DecisionAssertionSchema).pipe(
    Schema.minItems(1),
    Schema.maxItems(20)
  ),
  assumptions: Schema.Array(DecisionAssertionSchema).pipe(Schema.maxItems(20)),
  participants: Schema.Array(DecisionParticipantSchema).pipe(
    Schema.maxItems(100),
    Schema.filter(
      (items) =>
        new Set(items.map((item) => `${item.profileId}/${item.role}`)).size ===
        items.length
    )
  ),
  confidence: Schema.Number.pipe(Schema.finite(), Schema.between(0, 1)),
});

export type DecisionCandidate = typeof DecisionCandidateSchema.Type;
