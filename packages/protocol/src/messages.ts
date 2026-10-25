import type { Emotion } from './emotions';

/**
 * Mensajes por WebSocket entre cerebro y cuerpo (se usarán en la fase 5).
 * Definirlos ya fija el "contrato de API": hoy lo consume la cara web,
 * mañana la placa Waveshare, sin tocar el backend.
 */

// Cuerpo -> Cerebro
export type ClientMessage =
  | { type: 'user_text'; text: string }
  | { type: 'touch'; gesture: 'tap' | 'pet' | 'long_press' }
  | { type: 'motion'; event: 'shake' | 'upside_down' };

// Cerebro -> Cuerpo
export type ServerMessage =
  | { type: 'speak'; text: string; emotion: Emotion }
  | { type: 'emotion'; emotion: Emotion }
  | { type: 'error'; message: string };
