# 🎵 Orfeo

Acompañante con IA **local**: asistente, amigo y compañero de práctica.
El *cerebro* corre en el PC (NestJS + Ollama); los *cuerpos* (cara web, placa Waveshare) se conectan por WebSocket.

```
apps/server        → el cerebro (NestJS): persona, LLM, chat, memoria, tools, voz y WebSocket
apps/face-web      → el cuerpo web (Vite + React): pulsar para hablar; en la fase 5, la cara
packages/protocol  → contrato compartido: emociones, formato de respuesta, mensajes WS
```

## Puesta en marcha

Requisitos: Node 24+, pnpm, Ollama (y Docker a partir de la fase 2).

```bash
ollama pull qwen3:8b                         # modelo principal (cabe en 8 GB de VRAM)
pnpm install
cp apps/server/.env.example apps/server/.env  # en Windows: copy apps\server\.env.example apps\server\.env
pnpm chat                                    # charla con Orfeo en la terminal
```

API REST (con `pnpm build` y luego `pnpm --filter @orfeo/server start`):

```bash
curl -X POST localhost:3100/chat -H "Content-Type: application/json" -d '{"text":"hola Orfeo"}'
```

Para cambiar de modelo, edita `OLLAMA_MODEL` en `apps/server/.env`. El log muestra los **tokens/s** de cada respuesta, para comparar.

## Voz (fase 4)

```bash
pnpm db:up          # levanta MongoDB y Speaches (la primera vez descarga la imagen)
pnpm voice:setup    # descarga Whisper y Kokoro y hace una prueba de ida y vuelta
pnpm dev            # el cerebro, en http://localhost:3100 (WebSocket en /ws)
pnpm web            # en otra terminal: la web en http://localhost:5173
```
Mantén **ESPACIO** (o el botón) para hablar y suelta para enviar.

## Cómo está pensado

- **La persona es un dato** (`apps/server/src/persona/orfeo.persona.ts`): editas el carácter sin tocar la lógica.
- **Respuesta estructurada**: el LLM siempre devuelve `{ text, emotion }` (validado con zod). La emoción alimentará la cara.
- **Proveedor de LLM intercambiable** (`LlmProvider`): hoy Ollama, mañana otro sin tocar el chat.

## Hoja de ruta

| Fase | Qué | Estado |
|---|---|---|
| 1 | Chat con personalidad (CLI + REST) | ✅ |
| 2 | Memoria: conversaciones en MongoDB + recuerdos con embeddings (RAG) | ✅ |
| 3 | Agente con tools: fecha, notas, ideas, recordar ✅ · Gmail (lectura, borradores y envío solo con confirmación) ✅ | ✅ |
| 4 | Voz: Speaches (Whisper + Kokoro, CPU) + WebSocket + web con pulsar-para-hablar, español e inglés | ✅ |
| 5 | Cara virtual en React por WebSocket (emociones + "caricias" con el ratón) | ⏳ |
| 6 | Coach vocal: análisis de afinación y estabilidad mientras ensayas + feedback de Orfeo | ⏳ |
| 7 | Electrónica en el simulador Wokwi | ⏳ |
| 8 | Cuerpo real: placa Waveshare ESP32-S3 AMOLED | ⏳ |
