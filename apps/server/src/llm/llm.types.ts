/**
 * "Puerto" del LLM: el resto de la app solo conoce esta interfaz.
 * Hoy la implementa Ollama; mañana podría ser otro proveedor sin tocar el chat.
 */
export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolName: string; content: string };

/** Descripción de una herramienta tal como la ve el modelo. */
export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema de los argumentos. */
  parameters: object;
}

export interface LlmChatOptions {
  /** JSON Schema que la respuesta debe cumplir (structured outputs). */
  jsonSchema?: object;
}

export interface LlmToolResponse {
  content: string;
  toolCalls: ToolCall[];
}

export interface LlmProvider {
  chat(messages: ChatMessage[], options?: LlmChatOptions): Promise<string>;
  /** Chat en el que el modelo puede pedir ejecutar herramientas. */
  chatWithTools(messages: ChatMessage[], tools: ToolDefinition[]): Promise<LlmToolResponse>;
  /** Convierte textos en vectores que representan su significado. */
  embed(texts: string[]): Promise<number[][]>;
}

/** Token de inyección: NestJS no puede inyectar interfaces, así que usamos un símbolo. */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
