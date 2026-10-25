import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

/** Notas e ideas que Mariano le pide a Orfeo que apunte. */
@Schema({ timestamps: true })
export class Note {
  @Prop({ required: true })
  content!: string;

  @Prop({ type: [String], default: [], index: true })
  tags!: string[];

  createdAt!: Date;
}

export type NoteDocument = HydratedDocument<Note>;
export const NoteSchema = SchemaFactory.createForClass(Note);
NoteSchema.index({ content: 'text' }); // búsqueda por palabras
