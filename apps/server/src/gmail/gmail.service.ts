import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { gmail, type gmail_v1 } from '@googleapis/gmail';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { Env } from '../config/env';
import { createOAuthClient } from './gmail-auth';

export interface EmailSummary {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
}

export interface EmailFull extends EmailSummary {
  to: string;
  threadId: string;
  messageId: string;
  body: string;
}

export interface DraftInput {
  to: string;
  subject: string;
  body: string;
  /** id de un correo al que se responde: el borrador queda en el mismo hilo. */
  replyToId?: string;
}

/** Máximo de texto de un correo que le pasamos al modelo (el contexto es limitado). */
const MAX_BODY_CHARS = 4000;

export interface CreatedDraft {
  draftId: string;
  to: string;
  subject: string;
  body: string;
}

/** Acceso a Gmail. Nunca envía por su cuenta: `sendDraft` solo se llama tras la confirmación de Mariano. */
@Injectable()
export class GmailService {
  private readonly logger = new Logger(GmailService.name);
  private client?: gmail_v1.Gmail;
  /**
   * Borradores REALES creados en esta sesión. Los datos para enviar salen de aquí,
   * nunca de lo que diga el modelo (que puede inventarse ids o textos).
   */
  private readonly drafts = new Map<string, CreatedDraft>();

  constructor(private readonly config: ConfigService<Env, true>) {}

  isConnected(): boolean {
    return existsSync(this.config.get('GMAIL_TOKEN_PATH', { infer: true }));
  }

  async list(query = 'in:inbox', max = 10): Promise<EmailSummary[]> {
    const api = this.api();
    const { data } = await api.users.messages.list({ userId: 'me', q: query, maxResults: Math.min(max, 15) });
    const ids = (data.messages ?? []).map((m) => m.id!).filter(Boolean);
    return Promise.all(
      ids.map(async (id) => {
        const { data: msg } = await api.users.messages.get({
          userId: 'me',
          id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        });
        return this.summary(msg);
      }),
    );
  }

  async read(id: string): Promise<EmailFull> {
    const { data: msg } = await this.api().users.messages.get({ userId: 'me', id, format: 'full' });
    const header = (name: string) => this.header(msg, name);
    let body = extractBody(msg.payload);
    if (body.length > MAX_BODY_CHARS) body = `${body.slice(0, MAX_BODY_CHARS)}\n[...recortado]`;
    return {
      ...this.summary(msg),
      to: header('To'),
      threadId: msg.threadId ?? '',
      messageId: header('Message-ID') || header('Message-Id'),
      body,
    };
  }

  async createDraft(input: DraftInput): Promise<CreatedDraft> {
    let threadId: string | undefined;
    const extraHeaders: string[] = [];
    let subject = input.subject;

    if (input.replyToId) {
      const original = await this.read(input.replyToId);
      threadId = original.threadId;
      if (original.messageId) extraHeaders.push(`In-Reply-To: ${original.messageId}`, `References: ${original.messageId}`);
      if (!/^re:/i.test(subject)) subject = `Re: ${original.subject}`;
    }

    const raw = buildRawEmail({ ...input, subject }, extraHeaders);
    const { data } = await this.api().users.drafts.create({
      userId: 'me',
      requestBody: { message: { raw, threadId } },
    });
    this.logger.debug(`Borrador creado ${data.id} para ${input.to}`);
    const draft: CreatedDraft = { draftId: data.id!, to: input.to, subject, body: input.body };
    this.drafts.set(draft.draftId, draft);
    return draft;
  }

  /** Busca un borrador creado en esta sesión; sin id (o con uno inventado), devuelve el último. */
  findDraft(draftId?: string): CreatedDraft | undefined {
    if (draftId && this.drafts.has(draftId)) return this.drafts.get(draftId);
    return [...this.drafts.values()].at(-1);
  }

  async sendDraft(draftId: string): Promise<void> {
    await this.api().users.drafts.send({ userId: 'me', requestBody: { id: draftId } });
    this.drafts.delete(draftId); // un borrador enviado ya no existe
    this.logger.log(`📤 Borrador ${draftId} enviado`);
  }

  /** Cliente perezoso: se crea la primera vez que hace falta, con el token guardado. */
  private api(): gmail_v1.Gmail {
    if (this.client) return this.client;
    const tokenPath = this.config.get('GMAIL_TOKEN_PATH', { infer: true });
    if (!existsSync(tokenPath)) {
      throw new Error('Gmail no está conectado. Mariano tiene que ejecutar "pnpm gmail:auth".');
    }
    const oauth = createOAuthClient(this.config.get('GMAIL_CREDENTIALS_PATH', { infer: true }));
    oauth.setCredentials(JSON.parse(readFileSync(tokenPath, 'utf8')));
    // Google renueva el access token solo; guardamos el nuevo para la próxima vez.
    oauth.on('tokens', (tokens) => {
      const saved = JSON.parse(readFileSync(tokenPath, 'utf8'));
      writeFileSync(tokenPath, JSON.stringify({ ...saved, ...tokens }, null, 2));
    });
    this.client = gmail({ version: 'v1', auth: oauth });
    return this.client;
  }

  private header(msg: gmail_v1.Schema$Message, name: string): string {
    return msg.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
  }

  private summary(msg: gmail_v1.Schema$Message): EmailSummary {
    return {
      id: msg.id ?? '',
      from: this.header(msg, 'From'),
      subject: this.header(msg, 'Subject') || '(sin asunto)',
      date: this.header(msg, 'Date'),
      snippet: decodeEntities(msg.snippet ?? ''),
      unread: msg.labelIds?.includes('UNREAD') ?? false,
    };
  }
}

/** Recorre las partes MIME y devuelve el texto: prefiere text/plain; si no, HTML sin etiquetas. */
export function extractBody(part?: gmail_v1.Schema$MessagePart): string {
  if (!part) return '';
  const plain = findPart(part, 'text/plain');
  if (plain) return decode(plain).trim();
  const html = findPart(part, 'text/html');
  if (html) return htmlToText(decode(html));
  return '';
}

function findPart(part: gmail_v1.Schema$MessagePart, mime: string): string | undefined {
  if (part.mimeType === mime && part.body?.data) return part.body.data;
  for (const child of part.parts ?? []) {
    const found = findPart(child, mime);
    if (found) return found;
  }
  return undefined;
}

const decode = (data: string) => Buffer.from(data, 'base64url').toString('utf8');

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/** Arma el correo en formato RFC 822 (lo que Gmail espera) codificado en base64url. */
export function buildRawEmail(input: DraftInput, extraHeaders: string[] = []): string {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(input.subject, 'utf8').toString('base64')}?=`;
  const lines = [
    `To: ${input.to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    ...extraHeaders,
    '',
    input.body,
  ];
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}
