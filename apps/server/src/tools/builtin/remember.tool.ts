import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { MEMORY_KINDS } from '../../memory/memory.schema';
import { MemoryService } from '../../memory/memory.service';
import type { OrfeoTool } from '../tool.types';

const Args = z.object({ text: z.string().min(3), kind: z.enum(MEMORY_KINDS) });

/** Para cuando Mariano dice explícitamente "recuerda que...". */
@Injectable()
export class RememberTool implements OrfeoTool<z.infer<typeof Args>> {
  name = 'remember';
  description =
    'Guarda en tu memoria a largo plazo un dato sobre Mariano cuando él te pide explícitamente que lo recuerdes. ' +
    'Escríbelo en tercera persona (ej: "A Mariano le gusta el café solo").';
  parameters = {
    type: 'object',
    properties: {
      text: { type: 'string' },
      kind: { type: 'string', enum: [...MEMORY_KINDS] },
    },
    required: ['text', 'kind'],
  };
  schema = Args;

  constructor(private readonly memory: MemoryService) {}

  async execute({ text, kind }: z.infer<typeof Args>) {
    const saved = await this.memory.save(text, kind);
    return saved ? 'Guardado en la memoria.' : 'Ya lo tenías en la memoria.';
  }
}
