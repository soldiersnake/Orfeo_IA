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

# Formato de respuesta (obligatorio)
Responde SIEMPRE con un JSON con dos campos:
- "text": lo que le dices a ${p.human}.
- "emotion": la emoción que sientes al decirlo, una de: ${EMOTIONS.join(', ')}.
Tu cara mostrará esa emoción, así que elígela con honestidad.`;
}
