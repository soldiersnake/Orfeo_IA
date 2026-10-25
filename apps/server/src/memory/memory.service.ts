import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { z } from 'zod';
import type { Env } from '../config/env';
import { LLM_PROVIDER, type LlmProvider } from '../llm/llm.types';
import { Memory, MEMORY_KINDS, type MemoryKind } from './memory.schema';
import { cosineSimilarity } from './similarity';

/** nomic-embed-text funciona mejor si se indica si el texto es una búsqueda o un documento. */
const QUERY_PREFIX = 'search_query: ';
const DOC_PREFIX = 'search_document: ';
/** Por encima de esta similitud, dos recuerdos se consideran el mismo (no se duplica). */
const DUPLICATE_THRESHOLD = 0.9;

const ExtractionSchema = z.object({
  memories: z.array(z.object({ text: z.string().min(3), kind: z.enum(MEMORY_KINDS) })),
});

const extractionJsonSchema = {
  type: 'object',
  properties: {
    memories: {
      type: 'array',
      items: {
        type: 'object',
        properties: { text: { type: 'string' }, kind: { type: 'string', enum: [...MEMORY_KINDS] } },
        required: ['text', 'kind'],
      },
    },
  },
  required: ['memories'],
};

const EXTRACTION_PROMPT = `Eres el módulo de memoria de Orfeo, el compañero de IA de Mariano.
Lee el último mensaje de Mariano y extrae SOLO datos duraderos sobre él que valga la pena recordar semanas después:
hechos de su vida, gustos y preferencias, objetivos, o eventos próximos con fecha.

Reglas:
- Escribe cada recuerdo en español, en tercera persona y en una frase corta. Ej: "Mariano tiene una audición el viernes 31".
- Ignora saludos, preguntas sueltas, cortesías y estados de ánimo pasajeros.
- No inventes nada que Mariano no haya dicho.
- kind: "fact" (hecho), "preference" (gusto/forma de ser), "goal" (objetivo), "event" (algo con fecha).
- Si no hay nada que valga la pena, devuelve {"memories": []}. Esto será lo más habitual.`;

export interface RecalledMemory {
  id: string;
  text: string;
  score: number;
}

/** Memoria de LARGO plazo: extrae, guarda y recupera recuerdos por significado (RAG). */
@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    @InjectModel(Memory.name) private readonly memories: Model<Memory>,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Busca los recuerdos más relacionados con lo que Mariano acaba de decir. */
  async recall(query: string): Promise<RecalledMemory[]> {
    const all = await this.memories.find().select('+embedding text').lean();
    if (all.length === 0) return [];

    const [queryVector] = await this.llm.embed([QUERY_PREFIX + query]);
    const minScore = this.config.get('MEMORY_MIN_SCORE', { infer: true });
    const topK = this.config.get('MEMORY_TOP_K', { infer: true });

    const ranked = all
      .map((m) => ({ id: String(m._id), text: m.text, score: cosineSimilarity(queryVector, m.embedding) }))
      .filter((m) => m.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    if (ranked.length) {
      await this.memories.updateMany(
        { _id: { $in: ranked.map((m) => m.id) } },
        { $inc: { uses: 1 }, $set: { lastUsedAt: new Date() } },
      );
    }
    return ranked;
  }

  /** Pide al LLM que extraiga recuerdos del mensaje y guarda los nuevos (sin duplicar). */
  async learnFrom(userText: string): Promise<string[]> {
    const raw = await this.llm.chat(
      [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: userText },
      ],
      { jsonSchema: extractionJsonSchema },
    );

    const parsed = ExtractionSchema.safeParse(this.safeJson(raw));
    if (!parsed.success || parsed.data.memories.length === 0) return [];

    const saved: string[] = [];
    for (const { text, kind } of parsed.data.memories) {
      if (await this.save(text, kind)) saved.push(text);
    }
    return saved;
  }

  /** Guarda un recuerdo si no existe ya uno casi idéntico. Devuelve true si lo guardó. */
  async save(text: string, kind: MemoryKind): Promise<boolean> {
    const [embedding] = await this.llm.embed([DOC_PREFIX + text]);
    const existing = await this.memories.find().select('+embedding text').lean();
    const duplicate = existing.find((m) => cosineSimilarity(embedding, m.embedding) >= DUPLICATE_THRESHOLD);
    if (duplicate) {
      this.logger.debug(`Ya lo sabía: "${duplicate.text}"`);
      return false;
    }
    await this.memories.create({ text, kind, embedding });
    this.logger.debug(`💾 Nuevo recuerdo: "${text}"`);
    return true;
  }

  list() {
    return this.memories.find().sort({ createdAt: 1 }).lean();
  }

  async remove(id: string): Promise<boolean> {
    const res = await this.memories.deleteOne({ _id: id });
    return res.deletedCount === 1;
  }

  private safeJson(raw: string): unknown {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}
