import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Language } from '@orfeo/protocol';
import type { Env } from '../config/env';
import { normalizeLanguage } from './language';
import type { SpeechToText, TextToSpeech } from './voice.types';

/**
 * Cliente de Speaches (API compatible con OpenAI): una sola pieza que hace de oídos y de boca.
 * Si mañana cambias de motor, solo cambias esta clase.
 */
@Injectable()
export class SpeachesClient implements SpeechToText, TextToSpeech {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private get baseUrl() {
    return this.config.get('SPEACHES_URL', { infer: true });
  }

  async transcribe(
    audio: Buffer,
    mimeType: string,
  ): Promise<{ text: string; language: Language; rawLanguage?: string }> {
    const first = await this.transcribeOnce(audio, mimeType);
    // Solo hablamos español o inglés: si Whisper "oyó" otro idioma (p. ej. turco), repetimos forzando español.
    const raw = (first.rawLanguage ?? '').toLowerCase();
    const known = /^(es|en|spanish|english)/.test(raw);
    if (!known && first.text) return this.transcribeOnce(audio, mimeType, 'es');
    return first;
  }

  private async transcribeOnce(
    audio: Buffer,
    mimeType: string,
    forceLanguage?: Language,
  ): Promise<{ text: string; language: Language; rawLanguage?: string }> {
    const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('wav') ? 'wav' : mimeType.includes('mp4') ? 'mp4' : 'webm';
    // (el modo manos libres manda WAV; pulsar para hablar, webm/opus)
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(audio)], { type: mimeType }), `audio.${ext}`);
    form.append('model', this.config.get('STT_MODEL', { infer: true }));
    form.append('response_format', 'verbose_json'); // incluye el idioma detectado
    form.append('prompt', this.config.get('STT_PROMPT', { infer: true })); // ayuda con "Orfeo"
    if (forceLanguage) form.append('language', forceLanguage);

    const res = await this.call('/v1/audio/transcriptions', { method: 'POST', body: form }, 60_000);
    const data = (await res.json()) as { text: string; language?: string };
    return { text: data.text.trim(), language: normalizeLanguage(data.language), rawLanguage: data.language };
  }

  async synthesize(text: string, language: Language): Promise<{ mimeType: string; data: Buffer }> {
    const voice = this.config.get(language === 'en' ? 'TTS_VOICE_EN' : 'TTS_VOICE_ES', { infer: true });
    const res = await this.call(
      '/v1/audio/speech',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.get('TTS_MODEL', { infer: true }),
          voice,
          input: text,
          response_format: 'mp3',
        }),
      },
      60_000,
    );
    return { mimeType: 'audio/mpeg', data: Buffer.from(await res.arrayBuffer()) };
  }

  /** fetch con timeout y errores claros. */
  async call(path: string, init: RequestInit, timeoutMs = 15_000): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      if ((err as Error).name === 'TimeoutError') throw new Error(`Speaches tardó demasiado en ${path}`);
      throw new Error(`No pude conectar con Speaches en ${this.baseUrl}. ¿Está levantado (pnpm db:up)?`);
    }
    if (!res.ok) throw new Error(`Speaches respondió ${res.status} en ${path}: ${(await res.text()).slice(0, 300)}`);
    return res;
  }
}
