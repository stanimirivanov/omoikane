import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { AnalysisRunSchema } from './analysis-run';

const decode = Schema.decodeUnknownSync(AnalysisRunSchema);

describe('AnalysisRunSchema', () => {
  it('decodes the deterministic created state', () => {
    expect(
      decode({
        id: '30000000-0000-4000-8000-000000000001',
        workspaceId: '20000000-0000-4000-8000-000000000001',
        channelId: '40000000-0000-4000-8000-000000000001',
        requestedBy: '10000000-0000-4000-8000-000000000001',
        status: 'created',
        failureCategory: null,
        result: null,
        createdAt: new Date('2026-08-09T12:00:00.000Z'),
      })
    ).toMatchObject({ status: 'created' });
  });

  it.each(['created', 'queued', 'running'] as const)(
    'decodes the non-failed %s lifecycle projection',
    (status) => {
      expect(
        decode({
          id: '30000000-0000-4000-8000-000000000001',
          workspaceId: '20000000-0000-4000-8000-000000000001',
          channelId: '40000000-0000-4000-8000-000000000001',
          requestedBy: '10000000-0000-4000-8000-000000000001',
          status,
          failureCategory: null,
          result: null,
          createdAt: new Date(),
        })
      ).toMatchObject({ status, failureCategory: null });
    }
  );

  it('decodes failed status with a bounded category', () => {
    expect(
      decode({
        id: '30000000-0000-4000-8000-000000000001',
        workspaceId: '20000000-0000-4000-8000-000000000001',
        channelId: '40000000-0000-4000-8000-000000000001',
        requestedBy: '10000000-0000-4000-8000-000000000001',
        status: 'failed',
        failureCategory: 'provider.timeout',
        result: null,
        createdAt: new Date(),
      })
    ).toMatchObject({
      status: 'failed',
      failureCategory: 'provider.timeout',
    });
  });

  it('rejects unsupported execution states', () => {
    expect(() =>
      decode({
        id: '30000000-0000-4000-8000-000000000001',
        workspaceId: '20000000-0000-4000-8000-000000000001',
        channelId: '40000000-0000-4000-8000-000000000001',
        requestedBy: '10000000-0000-4000-8000-000000000001',
        status: 'completed',
        failureCategory: null,
        result: null,
        createdAt: new Date(),
      })
    ).toThrow();
  });

  it('rejects failure information on a non-failed run', () => {
    expect(() =>
      decode({
        id: '30000000-0000-4000-8000-000000000001',
        workspaceId: '20000000-0000-4000-8000-000000000001',
        channelId: '40000000-0000-4000-8000-000000000001',
        requestedBy: '10000000-0000-4000-8000-000000000001',
        status: 'running',
        failureCategory: 'provider.timeout',
        result: null,
        createdAt: new Date(),
      })
    ).toThrow();
  });

  it('decodes a succeeded run with its immutable result', () => {
    expect(
      decode({
        id: '30000000-0000-4000-8000-000000000001',
        workspaceId: '20000000-0000-4000-8000-000000000001',
        channelId: '40000000-0000-4000-8000-000000000001',
        requestedBy: '10000000-0000-4000-8000-000000000001',
        status: 'succeeded',
        failureCategory: null,
        result: {
          id: '92000000-0000-4000-8000-000000000001',
          analysisRunId: '30000000-0000-4000-8000-000000000001',
          kind: 'workspace-message-inventory',
          processorVersion: 'analysis.workspace-message-inventory.v1',
          providerKind: 'deterministic',
          model: null,
          evaluationVersion: 'workspace-message-inventory.v1',
          sourceCount: 0,
          sourceTruncated: false,
          sources: [],
          finding: {
            kind: 'workspace-message-inventory',
            status: 'proposed',
            title: 'Workspace message inventory',
            summary: 'Analyzed 0 active messages from 0 participants.',
            confidence: 1,
          },
          createdAt: new Date(),
        },
        createdAt: new Date(),
      })
    ).toMatchObject({ status: 'succeeded', result: { sourceCount: 0 } });
  });
});
