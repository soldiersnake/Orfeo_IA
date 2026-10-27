import type { ClientMessage, Emotion, OrfeoState, ServerMessage } from '@orfeo/protocol';
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

  const push = useCallback((line: Omit<ChatLine, 'id'>) => {
    setLines((prev) => [...prev.slice(-50), { ...line, id: nextId.current++ }]);
  }, []);

  const play = useCallback((mimeType: string, data: string) => {
    const audio = new Audio(`data:${mimeType};base64,${data}`);
    setSpeaking(true);
    audio.onended = audio.onerror = () => setSpeaking(false);
    audio.play().catch(() => setSpeaking(false)); // el navegador puede bloquear audio sin interacción previa
  }, []);

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
            if (msg.audio) play(msg.audio.mimeType, msg.audio.data);
            break;
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
  }, [push, play]);

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

  return { connected, state, emotion, lines, confirms, speaking, send, sendText, answerConfirm };
}
