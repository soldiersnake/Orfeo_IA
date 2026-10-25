import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Emotion } from '@orfeo/protocol';
import { randomUUID } from 'node:crypto';
import type { Model } from 'mongoose';
import type { ChatMessage } from '../llm/llm.types';
import { Message } from './message.schema';

/** Memoria de CORTO plazo: el hilo de la charla actual, guardado en MongoDB. */
@Injectable()
export class ConversationService implements OnModuleInit {
  private sessionId!: string;

  constructor(@InjectModel(Message.name) private readonly messages: Model<Message>) {}

  /** Al arrancar, retoma la última sesión: Orfeo recuerda de qué hablabais. */
  async onModuleInit() {
    const last = await this.messages.findOne().sort({ createdAt: -1 }).lean();
    this.sessionId = last?.sessionId ?? randomUUID();
  }

  async add(role: 'user' | 'assistant', content: string, emotion?: Emotion) {
    await this.messages.create({ sessionId: this.sessionId, role, content, emotion });
  }

  /** Últimos `limit` mensajes de la sesión, en orden cronológico, listos para el LLM. */
  async recent(limit: number): Promise<ChatMessage[]> {
    const docs = await this.messages
      .find({ sessionId: this.sessionId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return docs.reverse().map((m) => ({ role: m.role, content: m.content }));
  }

  /** Empieza una conversación nueva (lo anterior queda guardado, pero fuera del contexto). */
  newSession() {
    this.sessionId = randomUUID();
  }
}
