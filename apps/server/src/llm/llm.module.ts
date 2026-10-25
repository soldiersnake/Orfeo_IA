import { Module } from '@nestjs/common';
import { LLM_PROVIDER } from './llm.types';
import { OllamaProvider } from './ollama.provider';

@Module({
  providers: [{ provide: LLM_PROVIDER, useClass: OllamaProvider }],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
