import { Either, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { AnalysisResultSchema } from './analysis-result';

const source = {
  messageId: '90000000-0000-4000-8000-000000000001',
  messageRevisionId: '91000000-0000-4000-8000-000000000001',
};

const decisionResult = {
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
  usage: { inputUnits: 42, outputUnits: 17 },
  sourceCount: 1,
  sourceTruncated: false,
  sources: [source],
  summary: 'Extracted 1 proposed decision candidate.',
  candidates: [
    {
      id: '93000000-0000-4000-8000-000000000001',
      status: 'proposed',
      title: 'Release timing',
      summary: 'The release will happen Friday.',
      disposition: 'made',
      confidence: 0.9,
      claims: [{ text: 'Release on Friday.', evidence: [source] }],
      assumptions: [],
      participants: [
        {
          profileId: '10000000-0000-4000-8000-000000000001',
          role: 'decision-maker',
          evidence: [source],
        },
      ],
    },
  ],
  createdAt: new Date('2026-09-08T12:00:00Z'),
};

describe('AnalysisResultSchema', () => {
  it('decodes a persisted Decision Forensics projection', () => {
    expect(
      Schema.decodeUnknownSync(AnalysisResultSchema)(decisionResult)
    ).toMatchObject({
      kind: 'decision-forensics',
      candidates: [{ status: 'proposed', title: 'Release timing' }],
    });
  });

  it('rejects a projection whose source metadata is inconsistent', () => {
    const decoded = Schema.decodeUnknownEither(AnalysisResultSchema)({
      ...decisionResult,
      sourceCount: 2,
    });

    expect(Either.isLeft(decoded)).toBe(true);
  });
});
