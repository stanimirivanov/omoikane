import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewAnalysisDecisionCandidateRequest {
  @ApiProperty({ enum: ['confirm', 'reject'] })
  readonly action!: 'confirm' | 'reject';

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  readonly reason?: string | null;
}
