import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import type { Emotion } from '@orfeo/protocol';
import { AppModule } from '../app.module';
import { ChatService } from '../chat/chat.service';
import { MemoryService } from '../memory/memory.service';

/** Mientras no hay cara, la emoción se "dibuja" con un emoji. */
const FACE: Record<Emotion, string> = {
  neutral: '😐', happy: '😊', excited: '🤩', curious: '🤔', thinking: '🧐',
  concerned: '😟', sad: '😢', surprised: '😮', proud: '😌', sleepy: '😴',
};

async function main() {
  // Arranca Nest sin servidor HTTP: solo el contenedor de dependencias.
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });
  const chat = app.get(ChatService);
  const memory = app.get(MemoryService);
  let lastListing: string[] = []; // ids de la última vez que se mostró /recuerdos
  const rl = createInterface({ input: stdin, output: stdout });

  console.log('🎵 Orfeo está aquí. Comandos: /recuerdos, /olvidar <n>, /reset (charla nueva), /salir\n');

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
      console.log('(charla nueva; los recuerdos se mantienen)\n');
      continue;
    }
    if (text === '/recuerdos') {
      const all = await memory.list();
      lastListing = all.map((m) => String(m._id));
      console.log(all.length ? '' : '(todavía no recuerdo nada de ti)');
      all.forEach((m, i) => console.log(`  ${i + 1}. [${m.kind}] ${m.text}`));
      console.log('');
      continue;
    }
    if (text.startsWith('/olvidar')) {
      // Acepta varios: /olvidar 7 8 9 10
      const numbers = text.split(/\s+/).slice(1).map(Number).filter((n) => lastListing[n - 1]);
      if (numbers.length === 0) {
        console.log('Usa primero /recuerdos y luego /olvidar <números> (ej: /olvidar 7 8 9)\n');
        continue;
      }
      for (const n of numbers) {
        await memory.remove(lastListing[n - 1]);
        lastListing[n - 1] = '';
      }
      console.log(`(olvidados: ${numbers.join(', ')})\n`);
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
