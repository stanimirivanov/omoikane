import { TestBed } from '@angular/core/testing';
import { Either, Schema } from 'effect';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalysisDecisionCandidateIdSchema } from '@omoikane/domain/analysis';
import { AuthenticationApplicationService } from '../authentication/authentication-application.service';
import { AnalysisRunApiService } from './analysis-run-api.service';

const candidateId = Schema.decodeUnknownSync(AnalysisDecisionCandidateIdSchema)(
  '93000000-0000-4000-8000-000000000001'
);
const source = {
  messageId: '90000000-0000-4000-8000-000000000001',
  messageRevisionId: '91000000-0000-4000-8000-000000000001',
};
const reviewResponse = {
  id: '94000000-0000-4000-8000-000000000001',
  candidateId,
  reviewerId: '10000000-0000-4000-8000-000000000001',
  action: 'confirm',
  reason: 'Confirmed in planning.',
  occurredAt: '2026-09-08T13:00:00.000Z',
};

const runResponse = {
  id: '30000000-0000-4000-8000-000000000001',
  workspaceId: '20000000-0000-4000-8000-000000000001',
  channelId: '40000000-0000-4000-8000-000000000001',
  timeRange: {
    start: '2026-09-01T12:00:00.000Z',
    end: '2026-09-08T12:00:00.000Z',
  },
  requestedBy: '10000000-0000-4000-8000-000000000001',
  status: 'succeeded',
  failureCategory: null,
  result: {
    id: '92000000-0000-4000-8000-000000000001',
    analysisRunId: '30000000-0000-4000-8000-000000000001',
    kind: 'decision-forensics',
    processorVersion: 'analysis.decision-forensics.v1',
    providerKind: 'ollama',
    model: 'qwen3:8b',
    resultSchemaVersion: 'decision-forensics.result.v1',
    promptVersion: 'decision-forensics.extract.v1',
    promptDigest:
      'd0b179cc79776914ad559aef19e9060dd13bff3946200bbc6f7914a980e9fff1',
    evaluationVersion: 'decision-forensics.evaluation.v1',
    generationPolicy: {
      temperature: 0,
      maxOutputTokens: 8192,
      tools: false,
      repairAttempts: 0,
    },
    usage: { inputUnits: 10, outputUnits: 5 },
    sourceCount: 1,
    sourceTruncated: false,
    sources: [source],
    summary: 'Extracted one reviewed candidate.',
    candidates: [
      {
        id: candidateId,
        status: 'confirmed',
        review: reviewResponse,
        title: 'Release timing',
        summary: 'Release on Friday.',
        disposition: 'made',
        claims: [{ text: 'Release on Friday.', evidence: [source] }],
        assumptions: [],
        participants: [],
        confidence: 0.9,
      },
    ],
    createdAt: '2026-09-08T12:00:00.000Z',
  },
  createdAt: '2026-09-08T11:00:00.000Z',
};

const configureService = () => {
  TestBed.configureTestingModule({
    providers: [
      AnalysisRunApiService,
      {
        provide: AuthenticationApplicationService,
        useValue: {
          currentAccessToken: vi.fn().mockResolvedValue(Either.right('token')),
        },
      },
    ],
  });
  return TestBed.inject(AnalysisRunApiService);
};

describe('AnalysisRunApiService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
  });

  it('decodes nested review timestamps in an Analysis Run projection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(runResponse), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );

    const result = await configureService().get(
      runResponse.workspaceId,
      runResponse.id
    );

    expect(Either.isRight(result)).toBe(true);
    if (
      Either.isRight(result) &&
      result.right.result?.kind === 'decision-forensics'
    ) {
      expect(result.right.result.candidates[0]?.review?.occurredAt).toEqual(
        new Date(reviewResponse.occurredAt)
      );
    }
  });

  it('posts a review and maps a competing review to a conflict', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(reviewResponse), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(new Response(undefined, { status: 409 }));
    vi.stubGlobal('fetch', fetch);
    const service = configureService();

    const accepted = await service.reviewCandidate(
      runResponse.workspaceId,
      runResponse.id,
      candidateId,
      'confirm',
      reviewResponse.reason
    );
    const conflict = await service.reviewCandidate(
      runResponse.workspaceId,
      runResponse.id,
      candidateId,
      'reject',
      null
    );

    expect(accepted).toEqual(
      Either.right({
        ...reviewResponse,
        occurredAt: new Date(reviewResponse.occurredAt),
      })
    );
    expect(conflict).toEqual(Either.left({ kind: 'conflict' }));
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({
        action: 'confirm',
        reason: reviewResponse.reason,
      }),
    });
  });
});
