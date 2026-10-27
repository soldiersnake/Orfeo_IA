import { Module } from '@nestjs/common';
import { SpeachesClient } from './speaches.client';
import { SPEECH_TO_TEXT, TEXT_TO_SPEECH } from './voice.types';

@Module({
  providers: [
    SpeachesClient,
    { provide: SPEECH_TO_TEXT, useExisting: SpeachesClient },
    { provide: TEXT_TO_SPEECH, useExisting: SpeachesClient },
  ],
  exports: [SPEECH_TO_TEXT, TEXT_TO_SPEECH, SpeachesClient],
})
export class VoiceModule {}
