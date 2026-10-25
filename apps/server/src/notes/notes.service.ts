import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { FilterQuery, Model } from 'mongoose';
import { Note } from './note.schema';

@Injectable()
export class NotesService {
  constructor(@InjectModel(Note.name) private readonly notes: Model<Note>) {}

  create(content: string, tags: string[] = []) {
    return this.notes.create({ content, tags: tags.map((t) => t.toLowerCase()) });
  }

  search(query?: string, tag?: string, limit = 10) {
    const filter: FilterQuery<Note> = {};
    if (tag) filter.tags = tag.toLowerCase();
    if (query) filter.$text = { $search: query };
    return this.notes.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  }

  async remove(id: string) {
    return (await this.notes.deleteOne({ _id: id })).deletedCount === 1;
  }
}
