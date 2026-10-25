import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env';
import type { ChatMessage, LlmChatOptions, LlmProvider } from './llm.types';

/** Respuesta (parcial) de POST /api/chat de Ollama con stream: false. */
interface OllamaChatResponse {
  message: { role: string; content: string };
  eval_count?: number;
  eval_duration?: number; // nanosegundos
}

@Injectable()
export class OllamaProvider implements LlmProvider {
  private readonly logger = new Logger(OllamaProvider.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async chat(messages: ChatMessage[], options: LlmChatOptions = {}): Promise<string> {
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
        messages,
        stream: false,
        format: options.jsonSchema, // obliga al modelo a responder con este JSON
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

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Ollama respondió ${res.status}: ${body}`);
    }

    const data = (await res.json()) as OllamaChatResponse;

    // Métrica útil para comparar modelos: tokens por segundo.
    if (data.eval_count && data.eval_duration) {
      const tps = data.eval_count / (data.eval_duration / 1e9);
      this.logger.debug(`${model}: ${tps.toFixed(1)} tokens/s`);
    }

    return data.message.content;
  }
}
