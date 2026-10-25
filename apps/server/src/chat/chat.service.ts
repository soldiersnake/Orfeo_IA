import { Inject, Injectable, Logger } from '@nestjs/common';
import { OrfeoReply, OrfeoReplySchema, orfeoReplyJsonSchema } from '@orfeo/protocol';
import { ConversationService } from '../conversation/conversation.service';
import { LLM_PROVIDER, type LlmProvider } from '../llm/llm.types';
import { MemoryService, type RecalledMemory } from '../memory/memory.service';
import { orfeoPersona } from '../persona/orfeo.persona';
import { buildSystemPrompt } from '../persona/system-prompt';

/** Cuántos mensajes recientes de la charla entran en el contexto (memoria de corto plazo). */
const MAX_HISTORY = 20;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly basePrompt = buildSystemPrompt(orfeoPersona);

  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly conversation: ConversationService,
    private readonly memory: MemoryService,
  ) {}

  async reply(userText: string): Promise<OrfeoReply> {
    // 1. Recordar: qué sé de Mariano que tenga que ver con esto (si la memoria falla, seguimos sin ella)
    const recalled = await this.memory.recall(userText).catch((err) => {
      this.logger.warn(`Memoria no disponible: ${(err as Error).message}`);
      return [] as RecalledMemory[];
    });

    // 2. Contexto: persona + recuerdos + charla reciente + mensaje nuevo
    const history = await this.conversation.recent(MAX_HISTORY);
    const raw = await this.llm.chat(
      [
        { role: 'system', content: this.withMemories(recalled) },
        ...history,
        { role: 'user', content: userText },
      ],
      { jsonSchema: orfeoReplyJsonSchema },
    );
    const reply = this.parse(raw);

    // 3. Guardar el intercambio
    await this.conversation.add('user', userText);
    await this.conversation.add('assistant', reply.text, reply.emotion);

    // 4. Aprender en segundo plano (no hacemos esperar a Mariano)
    void this.memory.learnFrom(userText).catch((err) =>
      this.logger.warn(`No pude aprender de este mensaje: ${(err as Error).message}`),
    );

    return reply;
  }

  reset(): void {
    this.conversation.newSession();
  }

  private withMemories(recalled: RecalledMemory[]): string {
    if (recalled.length === 0) return this.basePrompt;
    this.logger.debug(`Recuerdos usados: ${recalled.map((m) => `"${m.text}" (${m.score.toFixed(2)})`).join(', ')}`);
    return `${this.basePrompt}

# Lo que recuerdas de ${orfeoPersona.human} (relacionado con este mensaje)
${recalled.map((m) => `- ${m.text}`).join('\n')}
Úsalo con naturalidad, como lo haría un amigo que se acuerda; no lo recites ni lo menciones si no viene al caso.`;
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
