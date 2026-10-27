import { Injectable } from '@nestjs/common';

import type { CreatedDraft } from './gmail.service';

/** Un envío que espera el "sí" de Mariano (con los datos REALES del borrador). */
export type PendingSend = CreatedDraft;

/**
 * La "bandeja de salida con candado": el modelo solo puede DEJAR cosas aquí.
 * Quien las ejecuta es el programa (CLI, y más adelante la cara web), tras preguntarle a Mariano.
 */
@Injectable()
export class PendingActionsService {
  private queue: PendingSend[] = [];

  add(action: PendingSend) {
    this.queue = this.queue.filter((a) => a.draftId !== action.draftId).concat(action);
  }

  /** Devuelve y vacía la cola. */
  takeAll(): PendingSend[] {
    const all = this.queue;
    this.queue = [];
    return all;
  }
}
