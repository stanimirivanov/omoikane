import { ApiProperty } from '@nestjs/swagger';

class AnalysisTimeRangeRequest {
  @ApiProperty({ format: 'date-time', description: 'Inclusive UTC start.' })
  readonly start!: string;

  @ApiProperty({ format: 'date-time', description: 'Exclusive UTC end.' })
  readonly end!: string;
}

/** HTTP request body for selecting the channel and time window to analyze. */
export class StartAnalysisRunRequest {
  @ApiProperty({ format: 'uuid' }) readonly channelId!: string;
  @ApiProperty({ type: () => AnalysisTimeRangeRequest })
  readonly timeRange!: AnalysisTimeRangeRequest;
}
