import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import type {
  ChatMessage,
  LlmChatOptions,
  LlmProvider,
  LlmToolResponse,
  ToolDefinition,
} from './llm.types';

/** Respuesta (parcial) de POST /api/chat de Ollama con stream: false. */
interface OllamaChatResponse {
  message: {
    role: string;
    content: string;
    tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[];
  };
  eval_count?: number;
  eval_duration?: number; // nanosegundos
}

@Injectable()
export class OllamaProvider implements LlmProvider {
  private readonly logger = new Logger(OllamaProvider.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async chat(messages: ChatMessage[], options: LlmChatOptions = {}): Promise<string> {
    const data = await this.request({ messages: this.toOllama(messages), format: options.jsonSchema });
    return data.message.content;
  }

  async chatWithTools(messages: ChatMessage[], tools: ToolDefinition[]): Promise<LlmToolResponse> {
    const data = await this.request({
      messages: this.toOllama(messages),
      tools: tools.map((t) => ({ type: 'function', function: t })),
    });
    return {
      content: data.message.content ?? '',
      toolCalls: (data.message.tool_calls ?? []).map((c) => ({
        name: c.function.name,
        arguments: c.function.arguments ?? {},
      })),
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    const url = `${this.config.get('OLLAMA_URL', { infer: true })}/api/embed`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.config.get('OLLAMA_EMBED_MODEL', { infer: true }), input: texts }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Ollama (embed) respondió ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { embeddings: number[][] };
    return data.embeddings;
  }

  /** Traduce nuestro formato de mensajes al de Ollama. */
  private toOllama(messages: ChatMessage[]) {
    return messages.map((m) => {
      if (m.role === 'tool') return { role: 'tool', tool_name: m.toolName, content: m.content };
      if (m.role === 'assistant' && m.toolCalls?.length) {
        return {
          role: 'assistant',
          content: m.content,
          tool_calls: m.toolCalls.map((c) => ({ function: { name: c.name, arguments: c.arguments } })),
        };
      }
      return { role: m.role, content: m.content };
    });
  }

  /** Llamada común a POST /api/chat, con timeout y errores claros. */
  private async request(body: Record<string, unknown>): Promise<OllamaChatResponse> {
    const url = `${this.config.get('OLLAMA_URL', { infer: true })}/api/chat`;
    const model = this.config.get('OLLAMA_MODEL', { infer: true });
    const think = this.config.get('OLLAMA_THINK', { infer: true });
    const timeoutMs = this.config.get('OLLAMA_TIMEOUT_MS', { infer: true });

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          ...body,
          ...(think !== undefined && { think }), // solo se envía si está configurado
          options: {
            num_ctx: this.config.get('OLLAMA_NUM_CTX', { infer: true }),
            temperature: this.config.get('OLLAMA_TEMPERATURE', { infer: true }),
          },
        }),
      });
    } catch (err) {
      if ((err as Error).name === 'TimeoutError') {
        throw new Error(`Ollama no respondió en ${timeoutMs / 1000}s (¿modelo muy grande o descargándose?)`);
      }
      throw new Error(`No pude conectar con Ollama en ${url}. ¿Está abierto?`);
    }

    if (!res.ok) throw new Error(`Ollama respondió ${res.status}: ${await res.text()}`);

    const data = (await res.json()) as OllamaChatResponse;
    // Métrica útil para comparar modelos: tokens por segundo.
    if (data.eval_count && data.eval_duration) {
      const tps = data.eval_count / (data.eval_duration / 1e9);
      this.logger.debug(`${model}: ${tps.toFixed(1)} tokens/s`);
    }
    return data;
  }
}
