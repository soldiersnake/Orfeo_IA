import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { ToolsModule } from '../tools/tools.module';
import { AgentService } from './agent.service';

@Module({
  imports: [LlmModule, ToolsModule],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
