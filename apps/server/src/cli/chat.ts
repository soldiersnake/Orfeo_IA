import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import type { Emotion } from '@orfeo/protocol';
import { AppModule } from '../app.module';
import { ChatService } from '../chat/chat.service';

/** Mientras no hay cara, la emoción se "dibuja" con un emoji. */
const FACE: Record<Emotion, string> = {
  neutral: '😐', happy: '😊', excited: '🤩', curious: '🤔', thinking: '🧐',
  concerned: '😟', sad: '😢', surprised: '😮', proud: '😌', sleepy: '😴',
};

async function main() {
  // Arranca Nest sin servidor HTTP: solo el contenedor de dependencias.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'debug'],
  });
  const chat = app.get(ChatService);
  const rl = createInterface({ input: stdin, output: stdout });

  console.log('🎵 Orfeo está aquí. Escribe "/reset" para olvidar la charla o "/salir" para terminar.\n');

  while (true) {
    let text: string;
    try {
      text = (await rl.question('Tú: ')).trim();
    } catch {
      break; // entrada cerrada (Ctrl+C / Ctrl+D)
    }
    if (!text) continue;
    if (text === '/salir') break;
    if (text === '/reset') {
      chat.reset();
      console.log('(memoria de la charla borrada)\n');
      continue;
    }
    try {
      stdout.write('Orfeo 🧐 pensando...\r');
      const { text: answer, emotion } = await chat.reply(text);
      console.log(`\nOrfeo ${FACE[emotion]}  ${answer}\n`);
    } catch (err) {
      console.error(`\n⚠️  ${(err as Error).message}\n   ¿Está Ollama abierto y el modelo descargado?\n`);
    }
  }

  rl.close();
  await app.close();
}
main();
