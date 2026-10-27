import type { Language } from '@orfeo/protocol';

/** Normaliza lo que devuelve Whisper ("es", "spanish", "en", "english"...). */
export function normalizeLanguage(raw?: string): Language {
  const l = (raw ?? '').toLowerCase();
  return l.startsWith('en') ? 'en' : 'es';
}

const EN =
  /\b(the|and|you|are|is|it|to|of|what|how|i'm|i|me|my|we|let's|that|this|with|for|your|can|do|have|sure|yes|no|great|good|let|will|would|be|so|just|in|on|at|english|practice|today|right)\b/gi;
const ES =
  /\b(el|la|los|las|que|de|y|es|en|un|una|por|para|con|tu|tú|te|qué|cómo|pero|muy|está|hola|claro|sí|vale|bien|mi|me|lo|del|al|se|ya|hoy)\b/gi;

/**
 * Adivina el idioma de un texto contando palabras muy comunes. Suficiente para elegir voz.
 * Si no está claro, usa `fallback` (por ejemplo, el idioma en que habló Mariano).
 */
export function detectLanguage(text: string, fallback: Language = 'es'): Language {
  if (/[ñáéíóú¿¡]/i.test(text)) return 'es';
  const en = text.match(EN)?.length ?? 0;
  const es = text.match(ES)?.length ?? 0;
  if (en === es) return fallback;
  return en > es ? 'en' : 'es';
}

/** Limpia el texto para que suene bien: sin emojis, markdown ni símbolos raros. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
    .replace(/[*_`#>~]/g, '')
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'un enlace')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Parte el texto en frases para hablar "en streaming": se sintetiza y suena la primera
 * mientras se prepara la siguiente. Las frases muy cortas se juntan con la siguiente.
 */
export function splitSentences(text: string, minLength = 25): string[] {
  const parts = text.split(/(?<=[.!?…])\s+/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const last = out.at(-1);
    if (last !== undefined && last.length < minLength) out[out.length - 1] = `${last} ${part}`;
    else out.push(part);
  }
  return out;
}
