import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { OrfeoTool } from '../tool.types';

/** Los LLM no saben qué día es: se lo damos con una tool. */
@Injectable()
export class DateTimeTool implements OrfeoTool<Record<string, never>> {
  name = 'get_datetime';
  description = 'Devuelve la fecha y hora actuales en Valencia (España). Úsala para cualquier pregunta sobre hoy, mañana, la hora o el día de la semana.';
  parameters = { type: 'object', properties: {} };
  schema = z.object({}).strict() as unknown as z.ZodType<Record<string, never>>;

  async execute() {
    return new Date().toLocaleString('es-ES', {
      timeZone: 'Europe/Madrid',
      dateStyle: 'full',
      timeStyle: 'short',
    });
  }
}
