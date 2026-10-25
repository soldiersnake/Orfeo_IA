import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export const MEMORY_KINDS = ['fact', 'preference', 'goal', 'event'] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];

/** Un recuerdo de LARGO plazo sobre Mariano, con su vector de significado. */
@Schema({ timestamps: true })
export class Memory {
  @Prop({ required: true })
  text!: string;

  @Prop({ required: true, enum: MEMORY_KINDS })
  kind!: MemoryKind;

  /** Embedding: ~768 números que representan el significado de `text`. */
  @Prop({ type: [Number], required: true, select: false })
  embedding!: number[];

  @Prop({ default: 0 })
  uses!: number;

  @Prop()
  lastUsedAt?: Date;

  createdAt!: Date;
}

export type MemoryDocument = HydratedDocument<Memory>;
export const MemorySchema = SchemaFactory.createForClass(Memory);
