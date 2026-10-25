import { Module } from '@nestjs/common';
import { MemoryModule } from '../memory/memory.module';
import { NotesModule } from '../notes/notes.module';
import { DateTimeTool } from './builtin/datetime.tool';
import { SaveNoteTool, SearchNotesTool } from './builtin/notes.tools';
import { RememberTool } from './builtin/remember.tool';
import { ORFEO_TOOLS, type OrfeoTool } from './tool.types';

/** Añadir una tool nueva = crear su clase y sumarla a esta lista. */
const TOOL_CLASSES = [DateTimeTool, SaveNoteTool, SearchNotesTool, RememberTool];

@Module({
  imports: [NotesModule, MemoryModule],
  providers: [
    ...TOOL_CLASSES,
    {
      provide: ORFEO_TOOLS,
      useFactory: (...tools: OrfeoTool[]) => tools,
      inject: TOOL_CLASSES,
    },
  ],
  exports: [ORFEO_TOOLS],
})
export class ToolsModule {}
