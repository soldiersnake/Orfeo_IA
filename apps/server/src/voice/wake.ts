import type { Language } from '@orfeo/protocol';

const strip = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Palabra de activación. Whisper no siempre escribe "Orfeo" igual
 * ("Orfeo", "Orfeó", "Orphe", "Morfeo"...), así que aceptamos variantes.
 */
const WAKE = /(^|[^a-z])(m?orfe(o|u)?|orph(e|eo|eus)|or feo)([^a-z]|$)/;

/** ¿Dijo "Orfeo"? Devuelve lo que dijo DESPUÉS del nombre (la petición). */
export function findWakeWord(text: string): { found: boolean; rest: string } {
  const match = WAKE.exec(strip(text));
  if (!match) return { found: false, rest: '' };
  const end = match.index + match[0].length;
  const rest = text.slice(end).replace(/^[\s,.:;!?¡¿-]+/, '').trim();
  return { found: true, rest };
}

// "descans" cubre descansa, descanse, descansá, descansar...
const SLEEP = /\b(descans\w*|a dormir|duermete|duerme|hasta luego|hasta manana|adios|buenas noches|nos vemos|go to sleep|rest now|good ?bye|good ?night|see you)\b/;

/** ¿Es una orden corta para que deje de escuchar? ("descansa", "hasta luego Orfeo"...) */
export function isSleepCommand(text: string): boolean {
  const words = text.trim().split(/\s+/).length;
  return words <= 6 && SLEEP.test(strip(text));
}

export const FIXED_PHRASES: Record<'wake' | 'sleep', Record<Language, string>> = {
  wake: { es: '¿Sí? Dime.', en: 'Yes? Tell me.' },
  sleep: { es: 'Vale, me quedo atento. Llámame cuando quieras.', en: "Okay, I'll be here. Call me anytime." },
};
