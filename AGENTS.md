# Orfeo — acompañante con IA local

Asistente/amigo de Mariano. **Cerebro** en el PC (NestJS + Ollama, todo local); **cuerpos** (cara web, placa ESP32-S3 Waveshare) se conectan por WebSocket con el contrato de `packages/protocol`. Hoja de ruta y estado de fases: `README.md`.

## Estructura
- `packages/protocol` — contrato compartido: emociones, `OrfeoReply {text, emotion}`, mensajes WS. Cambiarlo afecta a todos los clientes.
- `apps/server/src/persona` — personalidad como DATOS (`orfeo.persona.ts`) + generador del system prompt.
- `apps/server/src/llm` — interfaz `LlmProvider` (`chat`, `chatWithTools`, `embed`) + `OllamaProvider`. El resto de la app solo usa la interfaz (token `LLM_PROVIDER`).
- `apps/server/src/chat` — orquesta: recordar → agente → guardar → aprender en segundo plano.
- `apps/server/src/agent` — bucle de tool calling (máx. 5 pasos, máx. 2 usos por tool y turno, el último paso solo permite `respond`). El agente termina SIEMPRE llamando a la tool especial `respond({text, emotion})` (Ollama no combina bien `format` JSON + tools).
- `apps/server/src/agent/intent-hints.ts` — detector de intención por regex: añade una "[Pista del sistema]" antes del mensaje del usuario cuando claramente necesita una tool (correo, borradores, notas). Ampliar aquí si el modelo no usa una tool que debería.
- `apps/server/src/tools` — interfaz `OrfeoTool` (zod `schema` + JSON Schema `parameters` + `execute`). Añadir una tool = crear la clase en `builtin/` y sumarla a `TOOL_CLASSES` en `tools.module.ts`.
- `apps/server/src/notes` — notas/ideas en Mongo (etiquetas + índice de texto).
- `apps/server/src/gmail` — Gmail vía OAuth de escritorio (`pnpm gmail:auth`, token en `apps/server/.secrets/`, gitignored; guía en `docs/gmail-setup.md`). **El modelo nunca envía ni elige qué se envía**: `send_draft` solo acepta un `number` de la última lista de `list_drafts` (o nada = último borrador creado/mostrado); los borradores reales salen de Gmail vía `GmailService`, nunca de ids del modelo. Lo encola en `PendingActionsService`, y el cliente (CLI) pide confirmación s/n antes de `GmailService.sendDraft`. El resultado se registra en la charla con `ChatService.noteEvent` para que el modelo sepa qué pasó. El contenido de correos se envuelve como datos externos (defensa ante prompt injection).
- `apps/server/src/conversation` — memoria corta (mensajes por `sessionId` en Mongo).
- `apps/server/src/memory` — memoria larga: extracción con LLM, embeddings `embeddinggemma` (multilingüe; prefijos por modelo; se recalculan al arrancar si cambia el modelo), similitud coseno en Node (umbral `MEMORY_MIN_SCORE`).
- `apps/server/src/cli` — chat por terminal, `gmail-auth`, `voice-setup`.
- `apps/server/src/voice` — interfaces `SpeechToText`/`TextToSpeech` implementadas por `SpeachesClient` (contenedor Speaches en CPU, puerto 8000, API OpenAI: Whisper + Kokoro). `language.ts`: detección de idioma de la respuesta para elegir voz es/en, y limpieza de emojis/markdown antes de sintetizar.
- `apps/server/src/gateway` — WebSocket puro (`WsAdapter`, ruta `/ws`, puerto **3100**) que habla `ClientMessage`/`ServerMessage` de `packages/protocol`. Cola por conexión. Confirmaciones de correo vía `confirm_request` → `confirm_send` (solo se aceptan ids que el gateway pidió confirmar).
- `apps/face-web` — Vite + React 19 (ESM, solo `import type` del protocolo). Hooks `useOrfeoSocket` (reconexión) y `usePushToTalk` (MediaRecorder, ESPACIO). Su script es `build:web` (no `build`, para no ralentizar `pnpm chat`). Ojo: los `useEffect` deben usar llaves (no devolver valores como la Promise de `scrollIntoView`).

## Comandos
- `pnpm chat` — compila y abre el chat CLI
- `pnpm gmail:auth` — autoriza Gmail (una vez; en modo prueba caduca a los 7 días)
- `pnpm build` — compila todo (protocol primero)
- `pnpm dev` (cerebro con watch) · `pnpm web` (cara web en :5173) · `pnpm voice:setup` (modelos de voz + prueba)
- `pnpm db:up` / `pnpm db:down` — MongoDB + Speaches en Docker (**puerto 27018**; el 27017 es otro Mongo del usuario)
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
- Mariano lee el código y hace los commits él mismo: entregar cambios en bloques pequeños, con explicación breve y UN SOLO mensaje de commit sugerido, simple y específico (Conventional Commits, en español). Nunca listas de varios commits. No hacer commits.
- Explicaciones concisas, con analogías cuando el concepto es nuevo (sobre todo en electrónica).
