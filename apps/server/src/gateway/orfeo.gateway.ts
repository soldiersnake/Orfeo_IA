import { Inject, Logger } from '@nestjs/common';
import { OnGatewayConnection, WebSocketGateway } from '@nestjs/websockets';
import {
  ClientMessageSchema,
  type AudioPayload,
  type ClientMessage,
  type Language,
  type ServerMessage,
} from '@orfeo/protocol';
import type { WebSocket } from 'ws';
import { ChatService } from '../chat/chat.service';
import { GmailService, type CreatedDraft } from '../gmail/gmail.service';
import { PendingActionsService } from '../gmail/pending-actions.service';
import { cleanForSpeech, detectLanguage } from '../voice/language';
import {
  SPEECH_TO_TEXT,
  TEXT_TO_SPEECH,
  type SpeechToText,
  type TextToSpeech,
} from '../voice/voice.types';

/**
 * Puerta de entrada de los "cuerpos" (cara web, placa). Habla el protocolo de @orfeo/protocol.
 * Flujo: audio → texto (Whisper) → agente → texto + emoción → voz (Kokoro) → cuerpo.
 */
@WebSocketGateway({ path: '/ws' })
export class OrfeoGateway implements OnGatewayConnection {
  private readonly logger = new Logger(OrfeoGateway.name);
  /** Envíos de correo esperando el "sí" de Mariano en este cliente. */
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
    socket.on('message', (raw) => {
      queue = queue.then(() => this.onMessage(socket, raw.toString())).catch((err) => {
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
        return this.converse(socket, parsed.text, detectLanguage(parsed.text));

      case 'user_audio': {
        this.send(socket, { type: 'state', state: 'transcribing' });
        const audio = Buffer.from(parsed.audio.data, 'base64');
        const { text, language } = await this.stt.transcribe(audio, parsed.audio.mimeType);
        if (!text) {
          this.send(socket, { type: 'info', message: 'No te he oído bien, ¿lo repites?' });
          return this.send(socket, { type: 'state', state: 'idle' });
        }
        this.send(socket, { type: 'transcript', text, language });
        return this.converse(socket, text, language);
      }

      case 'touch':
        // Fase 5: reacciones a caricias. Por ahora, una emoción.
        return this.send(socket, { type: 'emotion', emotion: parsed.gesture === 'pet' ? 'happy' : 'surprised' });

      case 'confirm_send':
        return this.confirm(socket, parsed.draftId, parsed.accept);
    }
  }

  /** Texto de Mariano → agente → respuesta hablada. */
  private async converse(socket: WebSocket, text: string, userLanguage: Language) {
    this.send(socket, { type: 'state', state: 'thinking' });
    const reply = await this.chat.reply(text);
    // Idioma de la RESPUESTA; si hay duda, el idioma en que habló Mariano.
    const language = detectLanguage(reply.text, userLanguage);

    // La voz es un extra: si falla, la respuesta llega igual en texto.
    let audio: AudioPayload | undefined;
    try {
      const spoken = cleanForSpeech(reply.text);
      if (spoken) {
        const { mimeType, data } = await this.tts.synthesize(spoken, language);
        audio = { mimeType, data: data.toString('base64') };
      }
    } catch (err) {
      this.logger.warn(`Sin voz: ${(err as Error).message}`);
      this.send(socket, { type: 'info', message: 'No pude generar la voz (¿Speaches está levantado?)' });
    }

    this.send(socket, { type: 'state', state: 'speaking' });
    this.send(socket, { type: 'speak', text: reply.text, emotion: reply.emotion, language, audio });

    // 🔒 Envíos pendientes: se piden al cuerpo; nunca se envían sin su "sí".
    for (const draft of this.pending.takeAll()) {
      this.awaitingConfirm.set(draft.draftId, draft);
      this.send(socket, { type: 'confirm_request', ...draft });
    }
    this.send(socket, { type: 'state', state: 'idle' });
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
