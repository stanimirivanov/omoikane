import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Schema } from 'effect';
import { describe, expect, it, vi } from 'vitest';
import { AnalysisRunSchema } from '@omoikane/domain/analysis';
import { ChannelIdSchema } from '@omoikane/domain/channel';
import { WorkspaceIdSchema } from '@omoikane/domain/workspace';
import { AnalysisRunsComponent } from './analysis-runs.component';
import { AnalysisRunsStore } from './analysis-runs.store';

describe('AnalysisRunsComponent', () => {
  it('renders the proposed finding and its evidence count', async () => {
    const workspaceId = Schema.decodeUnknownSync(WorkspaceIdSchema)(
      '20000000-0000-4000-8000-000000000001'
    );
    const channelId = Schema.decodeUnknownSync(ChannelIdSchema)(
      '40000000-0000-4000-8000-000000000001'
    );
    const run = Schema.decodeUnknownSync(AnalysisRunSchema)({
      id: '30000000-0000-4000-8000-000000000001',
      workspaceId,
      channelId,
      timeRange: {
        start: new Date('2026-08-04T12:00:00.000Z'),
        end: new Date('2026-08-11T12:00:00.000Z'),
      },
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
        sourceCount: 2,
        sourceTruncated: false,
        sources: [
          {
            messageId: '90000000-0000-4000-8000-000000000001',
            messageRevisionId: '91000000-0000-4000-8000-000000000001',
          },
          {
            messageId: '90000000-0000-4000-8000-000000000002',
            messageRevisionId: '91000000-0000-4000-8000-000000000002',
          },
        ],
        finding: {
          kind: 'workspace-message-inventory',
          status: 'proposed',
          title: 'Channel message inventory',
          summary: 'Analyzed 2 active messages from 1 participant.',
          confidence: 1,
        },
        createdAt: new Date('2026-08-11T12:00:00.000Z'),
      },
      createdAt: new Date('2026-08-11T11:59:00.000Z'),
    });
    const store = {
      run: signal(run),
      status: signal('idle'),
      error: signal(null),
      timeRangeStart: signal(new Date('2026-08-04T12:00:00.000Z')),
      timeRangeEnd: signal(new Date('2026-08-11T12:00:00.000Z')),
      canStart: vi.fn(() => true),
      canEditTimeRange: vi.fn(() => true),
      setTimeRangeStart: vi.fn(),
      setTimeRangeEnd: vi.fn(),
      selectScope: vi.fn(),
      start: vi.fn(),
    };

    TestBed.overrideComponent(AnalysisRunsComponent, {
      set: { providers: [{ provide: AnalysisRunsStore, useValue: store }] },
    });
    await TestBed.configureTestingModule({
      imports: [AnalysisRunsComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(AnalysisRunsComponent);
    fixture.componentRef.setInput('workspaceId', workspaceId);
    fixture.componentRef.setInput('channelId', channelId);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(
      'Channel message inventory'
    );
    expect(fixture.nativeElement.textContent).toContain(
      'Analyzed 2 active messages from 1 participant.'
    );
    expect(fixture.nativeElement.textContent).toContain(
      'Evidence: 2 immutable message revisions.'
    );
    expect(fixture.nativeElement.textContent).toContain('Status: proposed');
    expect(fixture.nativeElement.textContent).toContain(
      '2026-08-04T12:00:00.000Z'
    );
    expect(fixture.nativeElement.textContent).toContain(
      '2026-08-11T12:00:00.000Z'
    );
    expect(fixture.nativeElement.querySelectorAll('time')).toHaveLength(2);
  });
});
