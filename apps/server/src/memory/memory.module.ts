import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LlmModule } from '../llm/llm.module';
import { MemoryController } from './memory.controller';
import { Memory, MemorySchema } from './memory.schema';
import { MemoryService } from './memory.service';

@Module({
  imports: [LlmModule, MongooseModule.forFeature([{ name: Memory.name, schema: MemorySchema }])],
  controllers: [MemoryController],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
