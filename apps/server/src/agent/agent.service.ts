import { Inject, Injectable, Logger } from '@nestjs/common';
import { EMOTIONS, OrfeoReplySchema, type OrfeoReply } from '@orfeo/protocol';
import { LLM_PROVIDER, type ChatMessage, type LlmProvider, type ToolDefinition } from '../llm/llm.types';
import { ORFEO_TOOLS, type OrfeoTool } from '../tools/tool.types';

/** Límite de vueltas del bucle: evita que un modelo confundido llame tools para siempre. */
const MAX_STEPS = 5;
/** Veces que se puede usar la misma tool en un turno antes de pedirle que responda. */
const MAX_CALLS_PER_TOOL = 2;

/**
 * La herramienta especial con la que el agente TERMINA: su respuesta final a Mariano.
 * (Ollama no combina bien "JSON obligatorio" con tools, así que responder también es una tool.)
 */
const RESPOND_TOOL: ToolDefinition = {
  name: 'respond',
  description:
    'Responde a Mariano. Llama SIEMPRE a esta herramienta para terminar tu turno, ' +
    'después de usar las demás herramientas que necesites.',
  parameters: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Lo que le dices a Mariano.' },
      emotion: { type: 'string', enum: [...EMOTIONS], description: 'La emoción que sientes al decirlo.' },
    },
    required: ['text', 'emotion'],
  },
};

export interface AgentResult {
  reply: OrfeoReply;
  toolsUsed: string[];
}

/**
 * Bucle de agente: el modelo piensa → pide herramientas → las ejecutamos → le damos el
 * resultado → repite, hasta que llama a `respond`.
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly toolsByName: Map<string, OrfeoTool>;
  private readonly definitions: ToolDefinition[];

  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @Inject(ORFEO_TOOLS) tools: OrfeoTool[],
  ) {
    this.toolsByName = new Map(tools.map((t) => [t.name, t]));
    this.definitions = [
      ...tools.map(({ name, description, parameters }) => ({ name, description, parameters })),
      RESPOND_TOOL,
    ];
  }

  async run(messages: ChatMessage[]): Promise<AgentResult> {
    const conversation = [...messages];
    const toolsUsed: string[] = [];

    for (let step = 0; step < MAX_STEPS; step++) {
      // En el último paso solo le dejamos responder: así nunca se queda sin contestar.
      const isLastStep = step === MAX_STEPS - 1;
      const tools = isLastStep ? [RESPOND_TOOL] : this.definitions;
      const { content, toolCalls } = await this.llm.chatWithTools(conversation, tools);

      // El modelo contestó en texto plano sin usar `respond`: lo aceptamos igual.
      if (toolCalls.length === 0) return { reply: this.fromPlainText(content), toolsUsed };

      // ¿Llamó a respond? Entonces terminó.
      const respond = toolCalls.find((c) => c.name === RESPOND_TOOL.name);
      if (respond) {
        const parsed = OrfeoReplySchema.safeParse(respond.arguments);
        if (parsed.success) return { reply: parsed.data, toolsUsed };
        this.logger.warn(`respond con argumentos inválidos: ${JSON.stringify(respond.arguments)}`);
      }

      // Ejecutar las demás tools y devolverle los resultados al modelo.
      conversation.push({ role: 'assistant', content, toolCalls });
      for (const call of toolCalls.filter((c) => c.name !== RESPOND_TOOL.name)) {
        const timesUsed = toolsUsed.filter((t) => t === call.name).length;
        const result =
          timesUsed >= MAX_CALLS_PER_TOOL
            ? `Ya usaste ${call.name} ${timesUsed} veces en este turno. No la repitas: responde a Mariano con lo que ya sabes.`
            : await this.execute(call.name, call.arguments);
        toolsUsed.push(call.name);
        conversation.push({ role: 'tool', toolName: call.name, content: result });
      }
    }

    this.logger.warn('El agente superó el máximo de pasos sin responder');
    return {
      reply: { text: 'Me he liado un poco con eso. ¿Me lo repites de otra forma?', emotion: 'concerned' },
      toolsUsed,
    };
  }

  /** Ejecuta una tool validando sus argumentos. Los errores vuelven al modelo como texto. */
  private async execute(name: string, args: unknown): Promise<string> {
    const tool = this.toolsByName.get(name);
    if (!tool) return `Error: la herramienta "${name}" no existe.`;

    const parsed = tool.schema.safeParse(args ?? {});
    if (!parsed.success) return `Error: argumentos inválidos para ${name}: ${parsed.error.message}`;

    try {
      this.logger.debug(`🔧 ${name}(${JSON.stringify(parsed.data)})`);
      return await tool.execute(parsed.data);
    } catch (err) {
      this.logger.warn(`Fallo en ${name}: ${(err as Error).message}`);
      return `Error al ejecutar ${name}: ${(err as Error).message}`;
    }
  }

  /** Plan B: si el modelo escribió texto (o un JSON) en vez de llamar a respond. */
  private fromPlainText(content: string): OrfeoReply {
    try {
      const parsed = OrfeoReplySchema.safeParse(JSON.parse(content));
      if (parsed.success) return parsed.data;
    } catch {
      /* no era JSON */
    }
    return { text: content.trim() || '...', emotion: 'neutral' };
  }
}
