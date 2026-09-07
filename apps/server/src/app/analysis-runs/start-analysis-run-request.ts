import { ApiProperty } from '@nestjs/swagger';

/** HTTP request body for selecting the channel analyzed by a new run. */
export class StartAnalysisRunRequest {
  @ApiProperty({ format: 'uuid' }) readonly channelId!: string;
}
