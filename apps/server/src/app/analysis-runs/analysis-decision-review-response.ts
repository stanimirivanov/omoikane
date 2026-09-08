import { ApiProperty } from '@nestjs/swagger';
import type { AnalysisDecisionReview } from '@omoikane/domain/analysis';

export class AnalysisDecisionReviewResponse {
  @ApiProperty({ format: 'uuid' }) readonly id: string;
  @ApiProperty({ format: 'uuid' }) readonly candidateId: string;
  @ApiProperty({ format: 'uuid' }) readonly reviewerId: string;
  @ApiProperty({ enum: ['confirm', 'reject'] })
  readonly action: 'confirm' | 'reject';
  @ApiProperty({ nullable: true, maxLength: 500, type: String })
  readonly reason: string | null;
  @ApiProperty({ format: 'date-time' }) readonly occurredAt: string;

  constructor(review: AnalysisDecisionReview) {
    this.id = review.id;
    this.candidateId = review.candidateId;
    this.reviewerId = review.reviewerId;
    this.action = review.action;
    this.reason = review.reason;
    this.occurredAt = review.occurredAt.toISOString();
  }
}
