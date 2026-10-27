import { useCallback, useEffect, useRef, useState } from 'react';

/** Graba mientras se mantiene pulsado (espacio o botón) y entrega el audio al soltar. */
export function usePushToTalk(onAudio: (audio: { mimeType: string; data: string }) => void) {
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    if (recorder.current?.state === 'recording') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); // apaga el micro
        if (Date.now() - startedAt.current < 400) return; // pulsación demasiado corta: la ignoramos
        const blob = new Blob(chunks.current, { type: rec.mimeType });
        onAudio({ mimeType: rec.mimeType || 'audio/webm', data: await blobToBase64(blob) });
      };
      rec.start();
      startedAt.current = Date.now();
      recorder.current = rec;
      setRecording(true);
      setError(null);
    } catch {
      setError('No pude acceder al micrófono. Revisa los permisos del navegador.');
    }
  }, [onAudio]);

  const stop = useCallback(() => {
    if (recorder.current?.state === 'recording') recorder.current.stop();
    setRecording(false);
  }, []);

  // Barra espaciadora (salvo si estás escribiendo en un campo de texto)
  useEffect(() => {
    const isTyping = (e: KeyboardEvent) => (e.target as HTMLElement)?.tagName === 'INPUT';
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !isTyping(e)) {
        e.preventDefault();
        void start();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e)) {
        e.preventDefault();
        stop();
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [start, stop]);

  return { recording, error, start, stop };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
