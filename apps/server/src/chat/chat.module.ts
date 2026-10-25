import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { ConversationModule } from '../conversation/conversation.module';
import { LlmModule } from '../llm/llm.module';
import { MemoryModule } from '../memory/memory.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [LlmModule, AgentModule, ConversationModule, MemoryModule],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
