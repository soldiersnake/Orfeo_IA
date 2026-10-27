import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MemoryService } from '../../memory/memory.service';
import type { OrfeoTool } from '../tool.types';

const Args = z.object({ query: z.string().min(2) });

/** Para preguntas directas sobre Mariano ("¿cuál es mi café favorito?"). */
@Injectable()
export class SearchMemoryTool implements OrfeoTool<z.infer<typeof Args>> {
  name = 'search_memory';
  description =
    'Busca en tu memoria a largo plazo lo que sabes de Mariano (gustos, datos, objetivos, eventos). ' +
    'Úsala cuando te pregunte algo sobre sí mismo que no esté ya en tu contexto.';
  parameters = {
    type: 'object',
    properties: { query: { type: 'string', description: 'Qué quieres recordar, en pocas palabras.' } },
    required: ['query'],
  };
  schema = Args;

  constructor(private readonly memory: MemoryService) {}

  async execute({ query }: z.infer<typeof Args>) {
    // Umbral más bajo que el automático: aquí la pregunta es explícita.
    const found = await this.memory.recall(query, { minScore: 0.3, topK: 5 });
    if (found.length === 0) return 'No tengo nada guardado sobre eso. Díselo a Mariano con sinceridad.';
    return found.map((m) => `- ${m.text}`).join('\n');
  }
}
