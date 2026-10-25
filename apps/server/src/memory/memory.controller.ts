import { Controller, Delete, Get, NotFoundException, Param } from '@nestjs/common';
import { MemoryService } from './memory.service';

/** Para ver y borrar lo que Orfeo sabe de ti (transparencia ante todo). */
@Controller('memories')
export class MemoryController {
  constructor(private readonly memory: MemoryService) {}

  @Get()
  list() {
    return this.memory.list();
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    if (!(await this.memory.remove(id))) throw new NotFoundException();
    return { ok: true };
  }
}
