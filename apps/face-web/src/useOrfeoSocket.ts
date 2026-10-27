import type { ClientMessage, Emotion, ListenMode, OrfeoState, ServerMessage, Timings } from '@orfeo/protocol';
import { useCallback, useEffect, useRef, useState } from 'react';

const WS_URL = import.meta.env.VITE_ORFEO_WS ?? 'ws://localhost:3100/ws';

export interface ChatLine {
  id: number;
  who: 'me' | 'orfeo' | 'system';
  text: string;
  emotion?: Emotion;
}

export interface ConfirmRequest {
  draftId: string;
  to: string;
  subject: string;
  body: string;
}

/** Conexión con el cerebro: estado, conversación y confirmaciones. Se reconecta sola. */
export function useOrfeoSocket() {
  const ws = useRef<WebSocket | null>(null);
  const nextId = useRef(0);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<OrfeoState>('idle');
  const [emotion, setEmotion] = useState<Emotion>('neutral');
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [confirms, setConfirms] = useState<ConfirmRequest[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [mode, setMode] = useState<ListenMode>('sleep');
  const [timings, setTimings] = useState<Timings | null>(null);
  /** Cola de frases de voz: suenan una detrás de otra según van llegando. */
  const audioQueue = useRef<string[]>([]);
  const playing = useRef(false);

  const push = useCallback((line: Omit<ChatLine, 'id'>) => {
    setLines((prev) => [...prev.slice(-50), { ...line, id: nextId.current++ }]);
  }, []);

  const playNext = useCallback(() => {
    const src = audioQueue.current.shift();
    if (!src) {
      playing.current = false;
      setSpeaking(false);
      return;
    }
    playing.current = true;
    setSpeaking(true);
    const audio = new Audio(src);
    audio.onended = audio.onerror = () => playNext();
    audio.play().catch(() => playNext()); // el navegador puede bloquear audio sin interacción previa
  }, []);

  const enqueue = useCallback(
    (mimeType: string, data: string) => {
      audioQueue.current.push(`data:${mimeType};base64,${data}`);
      if (!playing.current) playNext();
    },
    [playNext],
  );

  useEffect(() => {
    let closedByUs = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      const socket = new WebSocket(WS_URL);
      ws.current = socket;
      socket.onopen = () => setConnected(true);
      socket.onclose = () => {
        setConnected(false);
        if (!closedByUs) retry = setTimeout(connect, 2000); // reintenta cada 2 s
      };
      socket.onmessage = (event) => {
        const msg = JSON.parse(event.data) as ServerMessage;
        switch (msg.type) {
          case 'state':
            setState(msg.state);
            break;
          case 'transcript':
            push({ who: 'me', text: msg.text });
            break;
          case 'speak':
            setEmotion(msg.emotion);
            push({ who: 'orfeo', text: msg.text, emotion: msg.emotion });
            break;
          case 'audio_chunk':
            enqueue(msg.audio.mimeType, msg.audio.data);
            break;
          case 'mode':
            setMode(msg.mode);
            break;
          case 'timings':
            setTimings(msg.timings);
            break;
          case 'ignored':
            break; // estaba dormido y no era para él
          case 'emotion':
            setEmotion(msg.emotion);
            break;
          case 'confirm_request':
            setConfirms((prev) => [...prev, msg]);
            break;
          case 'info':
            push({ who: 'system', text: msg.message });
            break;
          case 'error':
            push({ who: 'system', text: `⚠️ ${msg.message}` });
            break;
        }
      };
    };

    connect();
    return () => {
      closedByUs = true;
      clearTimeout(retry);
      ws.current?.close();
    };
  }, [push, enqueue]);

  const send = useCallback((message: ClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(message));
  }, []);

  const sendText = useCallback(
    (text: string) => {
      push({ who: 'me', text });
      send({ type: 'user_text', text });
    },
    [push, send],
  );

  const answerConfirm = useCallback(
    (draftId: string, accept: boolean) => {
      send({ type: 'confirm_send', draftId, accept });
      setConfirms((prev) => prev.filter((c) => c.draftId !== draftId));
    },
    [send],
  );

  return {
    connected,
    state,
    emotion,
    lines,
    confirms,
    speaking,
    mode,
    setMode,
    timings,
    send,
    sendText,
    answerConfirm,
  };
}
