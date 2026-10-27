import type { Language } from '@orfeo/protocol';

/** Oídos: audio -> texto. */
export interface SpeechToText {
  transcribe(audio: Buffer, mimeType: string): Promise<{ text: string; language: Language }>;
}

/** Boca: texto -> audio. */
export interface TextToSpeech {
  synthesize(text: string, language: Language): Promise<{ mimeType: string; data: Buffer }>;
}

export const SPEECH_TO_TEXT = Symbol('SPEECH_TO_TEXT');
export const TEXT_TO_SPEECH = Symbol('TEXT_TO_SPEECH');
