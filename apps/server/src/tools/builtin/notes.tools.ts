import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { NotesService } from '../../notes/notes.service';
import type { OrfeoTool } from '../tool.types';

const SaveArgs = z.object({
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

@Injectable()
export class SaveNoteTool implements OrfeoTool<z.infer<typeof SaveArgs>> {
  name = 'save_note';
  description =
    'Guarda una nota o idea de Mariano. Llámala SIEMPRE que te pida apuntar, anotar, guardar o "tomar nota" de algo, ANTES de responder. ' +
    'Usa la etiqueta "idea" para ideas, "tarea" para pendientes, y otras etiquetas temáticas si encajan (ej: "musica", "trabajo").';
  parameters = {
    type: 'object',
    properties: {
      content: { type: 'string', description: 'El contenido de la nota, claro y completo.' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Etiquetas en minúsculas.' },
    },
    required: ['content'],
  };
  schema = SaveArgs;

  constructor(private readonly notes: NotesService) {}

  async execute({ content, tags }: z.infer<typeof SaveArgs>) {
    const note = await this.notes.create(content, tags);
    return `Nota guardada (id ${note.id}) con etiquetas: ${note.tags.join(', ') || 'ninguna'}.`;
  }
}

const SearchArgs = z.object({
  query: z.string().optional(),
  tag: z.string().optional(),
});

@Injectable()
export class SearchNotesTool implements OrfeoTool<z.infer<typeof SearchArgs>> {
  name = 'search_notes';
  description =
    'Busca entre las notas e ideas guardadas de Mariano. Sin argumentos devuelve las más recientes (úsala así si no sabes qué filtrar). Llámala UNA vez por pregunta. ' +
    'Usa "tag" para filtrar (ej: "idea", "tarea") y "query" para buscar palabras.';
  parameters = {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Palabras a buscar.' },
      tag: { type: 'string', description: 'Etiqueta para filtrar.' },
    },
  };
  schema = SearchArgs;

  constructor(private readonly notes: NotesService) {}

  async execute({ query, tag }: z.infer<typeof SearchArgs>) {
    const found = await this.notes.search(query, tag);
    if (found.length === 0) {
      return 'No hay notas que coincidan. No busques otra vez con otros filtros: díselo a Mariano tal cual.';
    }
    return found
      .map((n) => `- (${n.createdAt.toLocaleDateString('es-ES')}) [${n.tags.join(', ')}] ${n.content}`)
      .join('\n');
  }
}
