/**
 * Emociones que Orfeo puede expresar.
 * El LLM elige una en cada respuesta y cada "cuerpo" (cara web, placa)
 * decide cómo dibujarla.
 */
export const EMOTIONS = [
  'neutral',
  'happy',
  'excited',
  'curious',
  'thinking',
  'concerned',
  'sad',
  'surprised',
  'proud',
  'sleepy',
] as const;

export type Emotion = (typeof EMOTIONS)[number];
