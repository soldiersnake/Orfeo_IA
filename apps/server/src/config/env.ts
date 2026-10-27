import { z } from 'zod';

/** Valida las variables de entorno al arrancar: si falta algo, falla rápido y claro. */
const EnvSchema = z.object({
  PORT: z.coerce.number().default(3100), // 3100: el 3000 suele estar ocupado por otros proyectos
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
  /** Modelo que convierte texto en vectores (embeddings) para la memoria. */
  OLLAMA_EMBED_MODEL: z.string().default('embeddinggemma'),

  MONGO_URI: z.string().default('mongodb://localhost:27018/orfeo'),

  /** Speaches: servidor local de voz (Whisper para oír, Kokoro para hablar). */
  SPEACHES_URL: z.string().url().default('http://localhost:8000'),
  STT_MODEL: z.string().default('Systran/faster-whisper-small'),
  TTS_MODEL: z.string().default('speaches-ai/Kokoro-82M-v1.0-ONNX'),
  TTS_VOICE_ES: z.string().default('em_alex'),
  TTS_VOICE_EN: z.string().default('am_michael'),

  /** Credenciales OAuth de Google Cloud (cliente de escritorio) y token guardado tras autorizar. */
  GMAIL_CREDENTIALS_PATH: z.string().default('.secrets/gmail-credentials.json'),
  GMAIL_TOKEN_PATH: z.string().default('.secrets/gmail-token.json'),
  /** Cuántos recuerdos como máximo se añaden al prompt. */
  MEMORY_TOP_K: z.coerce.number().default(3),
  /** Similitud mínima (0-1) para considerar un recuerdo relevante. */
  MEMORY_MIN_SCORE: z.coerce.number().min(0).max(1).default(0.5),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Variables de entorno inválidas:\n${parsed.error.toString()}`);
  }
  return parsed.data;
}
