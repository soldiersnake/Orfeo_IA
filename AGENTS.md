# Orfeo — acompañante con IA local

Asistente/amigo de Mariano. **Cerebro** en el PC (NestJS + Ollama, todo local); **cuerpos** (cara web, placa ESP32-S3 Waveshare) se conectan por WebSocket con el contrato de `packages/protocol`. Hoja de ruta y estado de fases: `README.md`.

## Estructura
- `packages/protocol` — contrato compartido: emociones, `OrfeoReply {text, emotion}`, mensajes WS. Cambiarlo afecta a todos los clientes.
- `apps/server/src/persona` — personalidad como DATOS (`orfeo.persona.ts`) + generador del system prompt.
- `apps/server/src/llm` — interfaz `LlmProvider` (`chat`, `embed`) + `OllamaProvider`. El resto de la app solo usa la interfaz (token `LLM_PROVIDER`).
- `apps/server/src/chat` — orquesta: recordar → responder → guardar → aprender en segundo plano.
- `apps/server/src/conversation` — memoria corta (mensajes por `sessionId` en Mongo).
- `apps/server/src/memory` — memoria larga: extracción con LLM, embeddings `nomic-embed-text`, similitud coseno en Node.
- `apps/server/src/cli` — chat por terminal.

## Comandos
- `pnpm chat` — compila y abre el chat CLI
- `pnpm build` — compila todo (protocol primero)
- `pnpm db:up` / `pnpm db:down` — MongoDB de Orfeo en Docker (**puerto 27018**; el 27017 es otro Mongo del usuario)
- Config en `apps/server/.env` (ver `.env.example`, validado con zod en `src/config/env.ts`)

## Stack y entorno
Node 26, pnpm 10 (monorepo), NestJS 11 (CommonJS, `module: node16`), Mongoose 8 + `@nestjs/mongoose` 11 (la 12 es solo ESM: no usar), zod 3, Ollama local (`qwen3:8b` con `OLLAMA_THINK=false`, ~40 tok/s). GPU: RTX 4070 con 8 GB de VRAM; los modelos deben caber.

## Convenciones
- Comentarios y textos para el usuario en **español**; código e identificadores en inglés.
- Validar con zod toda entrada externa y toda salida del LLM; si el LLM devuelve algo roto, degradar sin romper la charla.
- Respuestas del LLM siempre estructuradas (JSON Schema en `format` de Ollama).
- Nuevas capacidades = módulos Nest pequeños; los proveedores externos van detrás de interfaces.
- Privacidad: todo local. **Las tools de email nunca envían sin confirmación explícita de Mariano.**

## Forma de trabajo
- Mariano lee el código y hace los commits él mismo: entregar cambios en bloques pequeños, con explicación breve y mensajes de commit sugeridos (Conventional Commits, en español). No hacer commits.
- Explicaciones concisas, con analogías cuando el concepto es nuevo (sobre todo en electrónica).
