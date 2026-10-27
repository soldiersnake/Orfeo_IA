import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WsAdapter } from '@nestjs/platform-ws';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import type { Env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useWebSocketAdapter(new WsAdapter(app)); // WebSocket "puro" (lo hablan navegador y ESP32)
  app.enableCors({ origin: [/^http:\/\/localhost:\d+$/] }); // la cara web en desarrollo
  const port = app.get(ConfigService<Env, true>).get('PORT', { infer: true });
  await app.listen(port);
  console.log(`🎵 Orfeo escuchando en http://localhost:${port} (WebSocket: ws://localhost:${port}/ws)`);
}
bootstrap();
