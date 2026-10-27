import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { z } from 'zod';
import type { Env } from '../config/env';
import { LLM_PROVIDER, type LlmProvider } from '../llm/llm.types';
import { Memory, MEMORY_KINDS, type MemoryKind } from './memory.schema';
import { cosineSimilarity } from './similarity';

/**
 * Cada modelo de embeddings rinde mejor si se le indica si el texto es una BÚSQUEDA o un DOCUMENTO.
 * Los prefijos son propios de cada modelo; si no lo conocemos, no ponemos ninguno.
 */
const PREFIXES: Record<string, { query: string; doc: string }> = {
  'nomic-embed-text': { query: 'search_query: ', doc: 'search_document: ' },
  embeddinggemma: { query: 'task: search result | query: ', doc: 'title: none | text: ' },
};
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
- NO guardes ideas de proyectos, notas, tareas ni cosas que Mariano pida "apuntar": eso va a sus notas, no a tu memoria.
- Un recuerdo por tema: no trocees una misma cosa en varias frases.
- Si no hay nada que valga la pena, devuelve {"memories": []}. Esto será lo más habitual.`;

export interface RecalledMemory {
  id: string;
  text: string;
  score: number;
}

/** Memoria de LARGO plazo: extrae, guarda y recupera recuerdos por significado (RAG). */
@Injectable()
export class MemoryService implements OnModuleInit {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    @InjectModel(Memory.name) private readonly memories: Model<Memory>,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get embedModel(): string {
    return this.config.get('OLLAMA_EMBED_MODEL', { infer: true });
  }

  private prefix(kind: 'query' | 'doc'): string {
    const known = Object.entries(PREFIXES).find(([name]) => this.embedModel.startsWith(name));
    return known ? known[1][kind] : '';
  }

  /** Si cambiaste de modelo de embeddings, recalcula los vectores viejos (no son comparables entre modelos). */
  async onModuleInit() {
    const stale = await this.memories.find({ embedModel: { $ne: this.embedModel } }).lean();
    if (stale.length === 0) return;
    this.logger.log(`Recalculando ${stale.length} recuerdos con ${this.embedModel}...`);
    try {
      const vectors = await this.llm.embed(stale.map((m) => this.prefix('doc') + m.text));
      await Promise.all(
        stale.map((m, i) =>
          this.memories.updateOne({ _id: m._id }, { embedding: vectors[i], embedModel: this.embedModel }),
        ),
      );
    } catch (err) {
      this.logger.warn(`No pude recalcular los recuerdos (¿hiciste "ollama pull ${this.embedModel}"?): ${(err as Error).message}`);
    }
  }

  /** Busca los recuerdos más relacionados con lo que Mariano acaba de decir. */
  async recall(query: string, opts: { minScore?: number; topK?: number } = {}): Promise<RecalledMemory[]> {
    const all = await this.memories.find({ embedModel: this.embedModel }).select('+embedding text').lean();
    if (all.length === 0) return [];

    const [queryVector] = await this.llm.embed([this.prefix('query') + query]);
    const minScore: number = opts.minScore ?? this.config.get('MEMORY_MIN_SCORE', { infer: true });
    const topK: number = opts.topK ?? this.config.get('MEMORY_TOP_K', { infer: true });

    const scored = all
      .map((m) => ({ id: String(m._id), text: m.text, score: cosineSimilarity(queryVector, m.embedding) }))
      .sort((a, b) => b.score - a.score);
    const ranked = scored.filter((m) => m.score >= minScore).slice(0, topK);

    // Para calibrar el umbral: los 3 mejores candidatos, entren o no.
    this.logger.debug(
      `Candidatos (umbral ${minScore}): ` +
        scored.slice(0, 3).map((m) => `${m.score.toFixed(2)} "${m.text.slice(0, 40)}"`).join(' | '),
    );

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
    const [embedding] = await this.llm.embed([this.prefix('doc') + text]);
    const existing = await this.memories.find({ embedModel: this.embedModel }).select('+embedding text').lean();
    const duplicate = existing.find((m) => cosineSimilarity(embedding, m.embedding) >= DUPLICATE_THRESHOLD);
    if (duplicate) {
      this.logger.debug(`Ya lo sabía: "${duplicate.text}"`);
      return false;
    }
    await this.memories.create({ text, kind, embedding, embedModel: this.embedModel });
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
