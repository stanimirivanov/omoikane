import { Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import type { AnalysisJobExecution } from './analysis-job';
import {
  AnalysisJobSourceSchema,
  AnalysisJobSourceSnapshotSchema,
} from './analysis-job';
import {
  buildWorkspaceMessageInventory,
  WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION,
} from './analysis-job-execution';

const execution = {
  jobId: '60000000-0000-4000-8000-000000000001',
  attemptId: '70000000-0000-4000-8000-000000000001',
  analysisRunId: '30000000-0000-4000-8000-000000000001',
  workspaceId: '20000000-0000-4000-8000-000000000001',
  kind: 'analysis.execute',
  version: 1,
  attemptNumber: 1,
  leaseToken: '80000000-0000-4000-8000-000000000001',
  leaseExpiresAt: new Date('2026-08-11T12:01:00.000Z'),
  processorVersion: WORKSPACE_MESSAGE_INVENTORY_PROCESSOR_VERSION,
  traceContext: {
    traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
    tracestate: null,
  },
} as AnalysisJobExecution;

const source = (index: number, authorIndex = 1) =>
  Schema.decodeUnknownSync(AnalysisJobSourceSchema)({
    messageId: `90000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    messageRevisionId: `91000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    authorUserId: `10000000-0000-4000-8000-${String(authorIndex).padStart(12, '0')}`,
  });

describe('channel-scoped workspace message inventory evaluation fixtures', () => {
  it('describes an empty channel without inventing evidence', () => {
    const receipt = buildWorkspaceMessageInventory(execution, {
      sources: [],
      sourceTruncated: false,
    });

    expect(receipt.result).toMatchObject({
      sourceCount: 0,
      sourceTruncated: false,
      summary: 'Analyzed 0 active messages from 0 participants.',
      sources: [],
    });
  });

  it('counts distinct participants from the selected evidence', () => {
    const receipt = buildWorkspaceMessageInventory(execution, {
      sources: [source(1, 1), source(2, 1), source(3, 2)],
      sourceTruncated: false,
    });

    expect(receipt.result.summary).toBe(
      'Analyzed 3 active messages from 2 participants.'
    );
    expect(receipt.result.finding).toMatchObject({
      status: 'proposed',
      confidence: 1,
    });
  });

  it('caps evidence at 100 and produces a stable fingerprint', () => {
    const sources = Array.from({ length: 100 }, (_, index) =>
      source(index + 1)
    );
    const snapshot = { sources, sourceTruncated: true };
    const first = buildWorkspaceMessageInventory(execution, snapshot);
    const second = buildWorkspaceMessageInventory(execution, snapshot);

    expect(first).toEqual(second);
    expect(first.result.sourceCount).toBe(100);
    expect(first.result.sourceTruncated).toBe(true);
    expect(first.result.sources).toHaveLength(100);
  });

  it('rejects impossible truncation metadata and duplicate evidence', () => {
    expect(
      Either.isLeft(
        Schema.decodeUnknownEither(AnalysisJobSourceSnapshotSchema)({
          sources: [source(1)],
          sourceTruncated: true,
        })
      )
    ).toBe(true);
    expect(
      Either.isLeft(
        Schema.decodeUnknownEither(AnalysisJobSourceSnapshotSchema)({
          sources: [source(1), source(1)],
          sourceTruncated: false,
        })
      )
    ).toBe(true);
  });
});
