import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { AnalysisProcessorReceiptSchema } from './analysis-job';
import { DECISION_EXTRACTION_PROMPT_DIGEST } from './extract-decisions';

const source = {
  messageId: '10000000-0000-4000-8000-000000000001',
  messageRevisionId: '20000000-0000-4000-8000-000000000001',
};
const receipt = () => ({
  processorVersion: 'analysis.decision-forensics.v1',
  resultFingerprint: 'decision-result-v1',
  result: {
    kind: 'decision-forensics',
    processorVersion: 'analysis.decision-forensics.v1',
    providerKind: 'ollama',
    model: 'qwen3:8b',
    resultSchemaVersion: 'decision-forensics.result.v1',
    promptVersion: 'decision-forensics.extract.v1',
    promptDigest: DECISION_EXTRACTION_PROMPT_DIGEST,
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
        title: 'Release timing',
        summary: 'The team decided to release Friday.',
        disposition: 'made',
        claims: [{ text: 'Release Friday.', evidence: [source] }],
        assumptions: [],
        participants: [
          {
            profileId: '30000000-0000-4000-8000-000000000001',
            role: 'decision-maker',
            evidence: [source],
          },
        ],
        confidence: 0.9,
      },
    ],
  },
});

describe('Decision Forensics processor receipt', () => {
  it('accepts the bounded manifest-linked persistence payload', () => {
    expect(
      Schema.decodeUnknownSync(AnalysisProcessorReceiptSchema)(receipt())
    ).toEqual(receipt());
  });

  it.each([
    ['source count', { sourceCount: 0 }],
    ['provider', { providerKind: 'hosted' }],
    ['model', { model: '' }],
    ['prompt digest', { promptDigest: 'mutable' }],
  ])('rejects an invalid %s', (_name, resultOverride) => {
    const value = receipt();
    expect(() =>
      Schema.decodeUnknownSync(AnalysisProcessorReceiptSchema)({
        ...value,
        result: { ...value.result, ...resultOverride },
      })
    ).toThrow();
  });
});
