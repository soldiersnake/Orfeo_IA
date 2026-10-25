import { z } from 'zod';

/** Valida las variables de entorno al arrancar: si falta algo, falla rápido y claro. */
const EnvSchema = z.object({
  PORT: z.coerce.number().default(3000),
  OLLAMA_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_MODEL: z.string().default('qwen3:8b'),
  OLLAMA_NUM_CTX: z.coerce.number().default(8192),
  OLLAMA_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  /** Modelos "pensantes" (qwen3, gemma4…) razonan antes de responder: más lento. false = respuesta directa. */
  OLLAMA_THINK: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  /** Si Ollama tarda más que esto, cortamos con un error claro en vez de quedarnos colgados. */
  OLLAMA_TIMEOUT_MS: z.coerce.number().default(120_000),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Variables de entorno inválidas:\n${parsed.error.toString()}`);
  }
  return parsed.data;
}
