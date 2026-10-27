import { Module } from '@nestjs/common';
import { GmailService } from './gmail.service';
import { PendingActionsService } from './pending-actions.service';

@Module({
  providers: [GmailService, PendingActionsService],
  exports: [GmailService, PendingActionsService],
})
export class GmailModule {}
