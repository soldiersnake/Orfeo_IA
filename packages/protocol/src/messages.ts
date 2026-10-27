import { z } from 'zod';
import { EMOTIONS, type Emotion } from './emotions';

/**
 * Mensajes por WebSocket entre el cerebro (server) y cualquier cuerpo
 * (cara web hoy, placa Waveshare mañana). Este es el contrato: si cambia, cambian todos.
 */

export const LANGUAGES = ['es', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

/** Audio en base64 (JSON no transporta binario). */
export const AudioPayloadSchema = z.object({
  mimeType: z.string(),
  data: z.string(), // base64
});
export type AudioPayload = z.infer<typeof AudioPayloadSchema>;

// ------------------------------------------------------------- Cuerpo -> Cerebro
export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('user_text'), text: z.string().min(1) }),
  z.object({
    type: z.literal('user_audio'),
    audio: AudioPayloadSchema,
    /**
     * push = pulsar para hablar · conversation = manos libres activo ·
     * wake = dormido: solo responde si oye "Orfeo".
     */
    listen: z.enum(['push', 'conversation', 'wake']).default('push'),
  }),
  z.object({ type: z.literal('touch'), gesture: z.enum(['tap', 'pet', 'long_press']) }),
  z.object({ type: z.literal('confirm_send'), draftId: z.string(), accept: z.boolean() }),
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// ------------------------------------------------------------- Cerebro -> Cuerpo
export type OrfeoState = 'idle' | 'transcribing' | 'thinking' | 'speaking';
export type ListenMode = 'active' | 'sleep';

/** Cuánto tardó cada etapa (ms), para saber dónde se va el tiempo. */
export interface Timings {
  /** Duración del audio que se envió (s). Si es mucho mayor que lo que hablaste, el detector de voz no cortó bien. */
  audioSeconds?: number;
  stt?: number;
  think?: number;
  /** Hasta que la PRIMERA frase de voz está lista (lo que tú percibes). */
  firstAudio?: number;
}

export type ServerMessage =
  | { type: 'state'; state: OrfeoState }
  | { type: 'transcript'; text: string; language: Language }
  /** Texto y emoción de la respuesta; la voz llega aparte, frase a frase, en `audio_chunk`. */
  | { type: 'speak'; text: string; emotion: Emotion; language: Language }
  | { type: 'audio_chunk'; audio: AudioPayload; final: boolean }
  | { type: 'mode'; mode: ListenMode }
  /** Estaba dormido y no oyó "Orfeo": no hace nada. */
  | { type: 'ignored' }
  | { type: 'timings'; timings: Timings }
  | { type: 'emotion'; emotion: Emotion }
  | { type: 'confirm_request'; draftId: string; to: string; subject: string; body: string }
  | { type: 'info'; message: string }
  | { type: 'error'; message: string };

export { EMOTIONS };
