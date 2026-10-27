import { Inject, Logger } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';
import {
  ClientMessageSchema,
  type ClientMessage,
  type Emotion,
  type Language,
  type ServerMessage,
  type Timings,
} from '@orfeo/protocol';
import type { WebSocket } from 'ws';
import { ChatService } from '../chat/chat.service';
import { GmailService, type CreatedDraft } from '../gmail/gmail.service';
import { PendingActionsService } from '../gmail/pending-actions.service';
import { cleanForSpeech, detectLanguage, splitSentences } from '../voice/language';
import {
  SPEECH_TO_TEXT,
  TEXT_TO_SPEECH,
  type SpeechToText,
  type TextToSpeech,
} from '../voice/voice.types';
import { FIXED_PHRASES, findWakeWord, isSleepCommand } from '../voice/wake';

type UserAudio = Extract<ClientMessage, { type: 'user_audio' }>;

/**
 * Puerta de entrada de los "cuerpos" (cara web, placa). Habla el protocolo de @orfeo/protocol.
 * Flujo: audio → texto (Whisper) → agente → texto + emoción → voz frase a frase (Kokoro) → cuerpo.
 */
@WebSocketGateway({ path: '/ws' })
export class OrfeoGateway implements OnGatewayConnection {
  private readonly logger = new Logger(OrfeoGateway.name);
  /** Envíos de correo esperando el "sí" de Mariano. */
  private readonly awaitingConfirm = new Map<string, CreatedDraft>();

  constructor(
    private readonly chat: ChatService,
    private readonly gmail: GmailService,
    private readonly pending: PendingActionsService,
    @Inject(SPEECH_TO_TEXT) private readonly stt: SpeechToText,
    @Inject(TEXT_TO_SPEECH) private readonly tts: TextToSpeech,
  ) {}

  handleConnection(socket: WebSocket) {
    this.logger.log('🎵 Un cuerpo se ha conectado');
    // Cola por conexión: los mensajes se procesan de uno en uno, en orden.
    let queue = Promise.resolve();
    socket.on('message', (raw: Buffer) => {
      queue = queue
        .then(() => this.onMessage(socket, raw.toString()))
        .catch((err) => {
          this.logger.warn((err as Error).message);
          this.send(socket, { type: 'error', message: (err as Error).message });
          this.send(socket, { type: 'state', state: 'idle' });
        });
    });
    socket.on('close', () => this.logger.log('Un cuerpo se ha desconectado'));
  }

  private async onMessage(socket: WebSocket, raw: string) {
    let parsed: ClientMessage;
    try {
      parsed = ClientMessageSchema.parse(JSON.parse(raw));
    } catch {
      return this.send(socket, { type: 'error', message: 'Mensaje con formato inválido' });
    }

    switch (parsed.type) {
      case 'user_text':
        return this.converse(socket, parsed.text, detectLanguage(parsed.text), {});
      case 'user_audio':
        return this.onAudio(socket, parsed);
      case 'touch':
        // Fase 5: reacciones a caricias. Por ahora, una emoción.
        return this.send(socket, { type: 'emotion', emotion: parsed.gesture === 'pet' ? 'happy' : 'surprised' });
      case 'confirm_send':
        return this.confirm(socket, parsed.draftId, parsed.accept);
    }
  }

  private async onAudio(socket: WebSocket, msg: UserAudio) {
    const sleeping = msg.listen === 'wake';
    // Dormido no mostramos "transcribiendo": la mayoría de lo que oye no es para él.
    if (!sleeping) this.send(socket, { type: 'state', state: 'transcribing' });

    const t0 = Date.now();
    const audio = Buffer.from(msg.audio.data, 'base64');
    const { text, language, rawLanguage } = await this.stt.transcribe(audio, msg.audio.mimeType);
    const timings: Timings = { stt: Date.now() - t0, audioSeconds: wavSeconds(audio, msg.audio.mimeType) };
    this.logger.debug(
      `👂 (${timings.stt} ms para ${timings.audioSeconds?.toFixed(1) ?? '?'} s de audio, ${msg.listen}, idioma ${rawLanguage}) "${text}"`,
    );

    if (!text) {
      if (sleeping) return this.send(socket, { type: 'ignored' });
      this.send(socket, { type: 'info', message: 'No te he oído bien, ¿lo repites?' });
      return this.send(socket, { type: 'state', state: 'idle' });
    }

    // 😴 Dormido: solo despierta con "Orfeo"
    if (sleeping) {
      const { found, rest } = findWakeWord(text);
      if (!found) return this.send(socket, { type: 'ignored' });
      this.send(socket, { type: 'mode', mode: 'active' });
      this.send(socket, { type: 'transcript', text, language });
      // "Orfeo, ¿qué tengo pendiente?" → responde directo. Solo "Orfeo" → "¿Sí? Dime."
      if (rest.split(/\s+/).filter(Boolean).length >= 2) return this.converse(socket, rest, language, timings);
      return this.speakFixed(socket, FIXED_PHRASES.wake[language], 'happy', language);
    }

    this.send(socket, { type: 'transcript', text, language });

    // 💤 "Descansa" en conversación activa → vuelve a dormir
    if (msg.listen === 'conversation' && isSleepCommand(text)) {
      await this.speakFixed(socket, FIXED_PHRASES.sleep[language], 'sleepy', language);
      return this.send(socket, { type: 'mode', mode: 'sleep' });
    }

    return this.converse(socket, text, language, timings);
  }

  /** Texto de Mariano → agente → respuesta hablada. */
  private async converse(socket: WebSocket, text: string, userLanguage: Language, timings: Timings) {
    this.send(socket, { type: 'state', state: 'thinking' });
    const t0 = Date.now();
    const reply = await this.chat.reply(text);
    timings.think = Date.now() - t0;

    // Idioma de la RESPUESTA; si hay duda, el idioma en que habló Mariano.
    const language = detectLanguage(reply.text, userLanguage);
    this.send(socket, { type: 'speak', text: reply.text, emotion: reply.emotion, language });
    await this.streamSpeech(socket, reply.text, language, timings);

    // 🔒 Envíos pendientes: se piden al cuerpo; nunca se envían sin su "sí".
    for (const draft of this.pending.takeAll()) {
      this.awaitingConfirm.set(draft.draftId, draft);
      this.send(socket, { type: 'confirm_request', ...draft });
    }
    this.send(socket, { type: 'state', state: 'idle' });
  }

  /** Frases fijas (sin pasar por el modelo): instantáneas. */
  private async speakFixed(socket: WebSocket, text: string, emotion: Emotion, language: Language) {
    this.send(socket, { type: 'speak', text, emotion, language });
    await this.streamSpeech(socket, text, language, {});
    this.send(socket, { type: 'state', state: 'idle' });
  }

  /**
   * Voz frase a frase: la primera suena mientras se sintetiza la siguiente.
   * La voz es un extra: si falla, la respuesta ya llegó en texto.
   */
  private async streamSpeech(socket: WebSocket, text: string, language: Language, timings: Timings) {
    const sentences = splitSentences(cleanForSpeech(text));
    if (sentences.length === 0) return;
    this.send(socket, { type: 'state', state: 'speaking' });
    const t0 = Date.now();
    try {
      for (const [i, sentence] of sentences.entries()) {
        const { mimeType, data } = await this.tts.synthesize(sentence, language);
        if (i === 0) {
          timings.firstAudio = Date.now() - t0;
          this.send(socket, { type: 'timings', timings });
          this.logger.debug(`⏱️ oír ${timings.stt ?? '-'} ms · pensar ${timings.think ?? '-'} ms · primera voz ${timings.firstAudio} ms`);
        }
        this.send(socket, {
          type: 'audio_chunk',
          audio: { mimeType, data: data.toString('base64') },
          final: i === sentences.length - 1,
        });
      }
    } catch (err) {
      this.logger.warn(`Sin voz: ${(err as Error).message}`);
      this.send(socket, { type: 'info', message: 'No pude generar la voz (¿Speaches está levantado?)' });
    }
  }

  private async confirm(socket: WebSocket, draftId: string, accept: boolean) {
    // Solo se puede confirmar algo que NOSOTROS pedimos confirmar.
    const draft = this.awaitingConfirm.get(draftId);
    if (!draft) return this.send(socket, { type: 'error', message: 'Ese envío no está pendiente de confirmación.' });
    this.awaitingConfirm.delete(draftId);

    if (!accept) {
      await this.chat.noteEvent(`Mariano decidió NO enviar el correo a ${draft.to}; quedó como borrador.`);
      return this.send(socket, { type: 'info', message: 'No lo envío; queda como borrador en tu Gmail.' });
    }
    try {
      await this.gmail.sendDraft(draftId);
      await this.chat.noteEvent(`Mariano confirmó y el correo a ${draft.to} ("${draft.subject}") se ENVIÓ correctamente.`);
      this.send(socket, { type: 'info', message: `✅ Correo enviado a ${draft.to}` });
    } catch (err) {
      await this.chat.noteEvent(`El envío del correo a ${draft.to} FALLÓ (${(err as Error).message}).`);
      this.send(socket, { type: 'error', message: `No se pudo enviar: ${(err as Error).message}` });
    }
  }

  private send(socket: WebSocket, message: ServerMessage) {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  }
}

/** Duración de un WAV PCM (bytes de datos / bytes por segundo). Para webm no lo sabemos sin decodificar. */
function wavSeconds(audio: Buffer, mimeType: string): number | undefined {
  if (!mimeType.includes('wav') || audio.length < 44) return undefined;
  const byteRate = audio.readUInt32LE(28);
  return byteRate ? (audio.length - 44) / byteRate : undefined;
}
