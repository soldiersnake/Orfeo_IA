import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { EMOTIONS, type Emotion } from '@orfeo/protocol';
import type { HydratedDocument } from 'mongoose';

/** Cada mensaje de la charla. `sessionId` agrupa una conversación (/reset abre otra). */
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class Message {
  @Prop({ required: true, index: true })
  sessionId!: string;

  @Prop({ required: true, enum: ['user', 'assistant'] })
  role!: 'user' | 'assistant';

  @Prop({ required: true })
  content!: string;

  @Prop({ enum: EMOTIONS })
  emotion?: Emotion;

  createdAt!: Date;
}

export type MessageDocument = HydratedDocument<Message>;
export const MessageSchema = SchemaFactory.createForClass(Message);
