import { z } from 'zod';
import { EMOTIONS } from './emotions';

/** Forma que DEBE tener cada respuesta del LLM. */
export const OrfeoReplySchema = z.object({
  text: z.string().min(1),
  emotion: z.enum(EMOTIONS),
});

export type OrfeoReply = z.infer<typeof OrfeoReplySchema>;

/**
 * Mismo esquema en JSON Schema "a mano" para pasárselo a Ollama
 * (structured outputs). Así el modelo está obligado a respetar el formato.
 */
export const orfeoReplyJsonSchema = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    emotion: { type: 'string', enum: [...EMOTIONS] },
  },
  required: ['text', 'emotion'],
} as const;
