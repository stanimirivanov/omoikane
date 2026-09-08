import { Schema } from 'effect';
import {
  MessageIdSchema,
  MessageRevisionIdSchema,
} from '@omoikane/domain/message';

/** Exact immutable message revision used as Analysis evidence. */
export const AnalysisResultSourceSchema = Schema.Struct({
  messageId: MessageIdSchema,
  messageRevisionId: MessageRevisionIdSchema,
});

export type AnalysisResultSource = typeof AnalysisResultSourceSchema.Type;
