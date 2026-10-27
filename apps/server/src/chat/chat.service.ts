import { Injectable, Logger } from '@nestjs/common';
import type { OrfeoReply } from '@orfeo/protocol';
import { AgentService } from '../agent/agent.service';
import { ConversationService } from '../conversation/conversation.service';
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
    private readonly agent: AgentService,
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
    const { reply, toolsUsed } = await this.agent.run([
      { role: 'system', content: `${this.withMemories(recalled)}\n\n${this.now()}` },
      ...history,
      { role: 'user', content: userText },
    ]);
    if (toolsUsed.length) this.logger.debug(`Herramientas usadas: ${toolsUsed.join(', ')}`);

    // 3. Guardar el intercambio
    await this.conversation.add('user', userText);
    await this.conversation.add('assistant', reply.text, reply.emotion);

    // 4. Aprender en segundo plano (no hacemos esperar a Mariano)
    // (si ya guardó un recuerdo o una nota en este turno, no hace falta)
    if (!toolsUsed.some((t) => t === 'remember' || t === 'save_note')) void this.memory.learnFrom(userText).catch((err) =>
      this.logger.warn(`No pude aprender de este mensaje: ${(err as Error).message}`),
    );

    return reply;
  }

  /** La fecha va en el contexto de cada turno: más fiable que una tool para modelos pequeños. */
  private now(): string {
    const date = new Date().toLocaleString('es-ES', {
      timeZone: 'Europe/Madrid',
      dateStyle: 'full',
      timeStyle: 'short',
    });
    return `# Ahora\nHoy es ${date} (hora de Valencia). Si ${orfeoPersona.human} pregunta el día o la hora, díselos con exactitud.`;
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
}
