/**
 * Detector de intención por palabras clave.
 * Los modelos pequeños a veces responden "de memoria" en vez de usar una herramienta.
 * Si el mensaje claramente necesita una, le dejamos una pista justo antes del mensaje.
 * Es barato, predecible y fácil de ampliar.
 */
interface IntentRule {
  pattern: RegExp;
  hint: string;
}

const RULES: IntentRule[] = [
  {
    // borradores / pendientes de enviar
    pattern: /\b(borrador(es)?|pendientes?|sin enviar|por enviar)\b/i,
    hint:
      'Pregunta sobre correos pendientes/borradores: llama a list_drafts (con "to" si nombra a alguien) ANTES de responder.',
  },
  {
    // correo en general
    pattern: /\b(correos?|mails?|e-?mails?|gmail|bandeja|inbox|me escribi[óo]|respond[eé]le|resp[oó]ndele|env[ií]a(lo|le)?)\b/i,
    hint:
      'Pregunta sobre el correo de Mariano: consulta Gmail con tus herramientas (list_emails, list_drafts, read_email, create_draft, send_draft) ANTES de responder. ' +
      'No respondas de memoria ni copies respuestas anteriores: el buzón cambia.',
  },
  {
    pattern: /\b(ap[uú]nta(me|lo)?|anota(me|lo)?|toma nota|guarda(me|lo)? (esta|la) idea)\b/i,
    hint: 'Pide guardar algo: llama a save_note ANTES de responder.',
  },
  {
    pattern: /\b(mis (ideas|notas)|qu[eé] (ideas|notas)|ideas guardadas|notas guardadas)\b/i,
    hint: 'Pregunta por sus notas o ideas: llama a search_notes ANTES de responder.',
  },
];

/** Devuelve las pistas que aplican al mensaje (puede ser ninguna). */
export function intentHints(text: string): string[] {
  return RULES.filter((r) => r.pattern.test(text)).map((r) => r.hint);
}
