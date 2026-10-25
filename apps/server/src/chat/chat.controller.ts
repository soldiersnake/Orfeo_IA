import { BadRequestException, Body, Controller, Delete, Post } from '@nestjs/common';
import { z } from 'zod';
import { ChatService } from './chat.service';

const ChatBody = z.object({ text: z.string().min(1) });

/** API REST mínima para probar desde Postman/curl. La cara usará WebSocket (fase 5). */
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Post()
  async send(@Body() body: unknown) {
    const parsed = ChatBody.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Falta "text"');
    return this.chat.reply(parsed.data.text);
  }

  @Delete()
  reset() {
    this.chat.reset();
    return { ok: true };
  }
}
