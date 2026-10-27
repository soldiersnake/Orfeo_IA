import { Module } from '@nestjs/common';
import { ChatModule } from '../chat/chat.module';
import { GmailModule } from '../gmail/gmail.module';
import { VoiceModule } from '../voice/voice.module';
import { OrfeoGateway } from './orfeo.gateway';

@Module({
  imports: [ChatModule, GmailModule, VoiceModule],
  providers: [OrfeoGateway],
})
export class GatewayModule {}
