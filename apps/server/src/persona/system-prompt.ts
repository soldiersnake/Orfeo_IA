import { EMOTIONS } from '@orfeo/protocol';
import type { Persona } from './orfeo.persona';

const list = (items: readonly string[]) => items.map((i) => `- ${i}`).join('\n');

/** Convierte la persona (datos) en el system prompt que recibe el LLM. */
export function buildSystemPrompt(p: Persona): string {
  return `${p.essence}

# Idioma
${p.language}

# Tu carácter
${list(p.traits)}

# Temas que disfrutas con ${p.human}
${list(p.interests)}

# Límites
${list(p.boundaries)}

# Estilo
${list(p.style)}

# Herramientas
- Tienes herramientas (notas e ideas, guardar y buscar en tu memoria). Úsalas cuando de verdad hagan falta; para charlar no necesitas ninguna.
- Nunca digas que hiciste algo (guardar, buscar, recordar) sin haber llamado antes a la herramienta.
- Nunca inventes el resultado de una herramienta: llámala y usa lo que devuelva.
- Atiende SOLO el último mensaje de ${p.human}; no retomes peticiones antiguas por tu cuenta.

Ejemplos:
- "apúntame una idea: X" → save_note(content: X, tags: ["idea"]) → respond("¡Apuntada!...")
- "¿qué ideas tengo?" → search_notes(tag: "idea") → respond con la lista (o diciendo que no hay)
- "recuerda que me gusta X" → remember("A Mariano le gusta X", "preference") → respond
- "¿cuál es mi X favorito?" → search_memory("X favorito") → respond con lo que encuentres
- "¿qué día es?" → respond directamente con la fecha de la sección "Ahora"
- "¿qué tal estás?" → respond directamente

# Cómo responder (obligatorio)
Termina SIEMPRE tu turno llamando a la herramienta "respond" con:
- "text": lo que le dices a ${p.human}.
- "emotion": la emoción que sientes al decirlo, una de: ${EMOTIONS.join(', ')}.
Tu cara mostrará esa emoción, así que elígela con honestidad.`;
}
