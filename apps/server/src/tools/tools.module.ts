import { Module } from '@nestjs/common';
import { MemoryModule } from '../memory/memory.module';
import { NotesModule } from '../notes/notes.module';
import { SaveNoteTool, SearchNotesTool } from './builtin/notes.tools';
import { RememberTool } from './builtin/remember.tool';
import { SearchMemoryTool } from './builtin/search-memory.tool';
import { ORFEO_TOOLS, type OrfeoTool } from './tool.types';

/** Añadir una tool nueva = crear su clase y sumarla a esta lista. */
const TOOL_CLASSES = [SaveNoteTool, SearchNotesTool, RememberTool, SearchMemoryTool];

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
