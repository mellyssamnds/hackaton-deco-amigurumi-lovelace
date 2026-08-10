import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LlmAdvisorService } from './llm-advisor.service';

@Module({
  imports: [ConfigModule],
  providers: [LlmAdvisorService],
  exports: [LlmAdvisorService],
})
export class LlmAdvisorModule {}
