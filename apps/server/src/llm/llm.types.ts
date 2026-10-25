/**
 * "Puerto" del LLM: el resto de la app solo conoce esta interfaz.
 * Hoy la implementa Ollama; mañana podría ser otro proveedor sin tocar el chat.
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmChatOptions {
  /** JSON Schema que la respuesta debe cumplir (structured outputs). */
  jsonSchema?: object;
}

export interface LlmProvider {
  chat(messages: ChatMessage[], options?: LlmChatOptions): Promise<string>;
}

/** Token de inyección: NestJS no puede inyectar interfaces, así que usamos un símbolo. */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
