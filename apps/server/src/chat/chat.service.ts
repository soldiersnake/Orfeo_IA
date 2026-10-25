import { Inject, Injectable, Logger } from '@nestjs/common';
import { OrfeoReply, OrfeoReplySchema, orfeoReplyJsonSchema } from '@orfeo/protocol';
import { LLM_PROVIDER, type ChatMessage, type LlmProvider } from '../llm/llm.types';
import { orfeoPersona } from '../persona/orfeo.persona';
import { buildSystemPrompt } from '../persona/system-prompt';

/** Cuántos mensajes recientes recuerda (memoria de corto plazo). En la fase 2 llega la memoria larga. */
const MAX_HISTORY = 20;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly systemPrompt = buildSystemPrompt(orfeoPersona);
  private history: ChatMessage[] = [];

  constructor(@Inject(LLM_PROVIDER) private readonly llm: LlmProvider) {}

  async reply(userText: string): Promise<OrfeoReply> {
    this.history.push({ role: 'user', content: userText });

    const raw = await this.llm.chat(
      [{ role: 'system', content: this.systemPrompt }, ...this.history],
      { jsonSchema: orfeoReplyJsonSchema },
    );

    const reply = this.parse(raw);
    this.history.push({ role: 'assistant', content: JSON.stringify(reply) });
    this.history = this.history.slice(-MAX_HISTORY);
    return reply;
  }

  reset(): void {
    this.history = [];
  }

  /** Valida lo que devolvió el modelo; si viene roto, no rompemos la charla. */
  private parse(raw: string): OrfeoReply {
    try {
      return OrfeoReplySchema.parse(JSON.parse(raw));
    } catch {
      this.logger.warn(`Respuesta fuera de formato: ${raw.slice(0, 200)}`);
      return { text: raw.trim() || '...', emotion: 'neutral' };
    }
  }
}
