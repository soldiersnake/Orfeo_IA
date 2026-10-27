import { useCallback, useEffect, useRef, useState } from 'react';
import { bytesToBase64, encodeWav } from './wav';

/**
 * Manos libres: escucha continuamente y detecta cuándo hablas (VAD = Voice Activity Detection)
 * midiendo el volumen. Cuando terminas una frase, entrega el audio en WAV.
 *
 * Analogía: es como un portero que mira el nivel de ruido de la sala; cuando alguien
 * habla por encima del murmullo, empieza a grabar, y cuando vuelve el silencio, corta.
 */

// Procesador de audio que corre en otro hilo y nos pasa bloques de 1024 muestras (~21 ms).
const WORKLET = `
class OrfeoCapture extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(1024); this.i = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let k = 0; k < ch.length; k++) {
      this.buf[this.i++] = ch[k];
      if (this.i === 1024) { this.port.postMessage(this.buf.slice(0)); this.i = 0; }
    }
    return true;
  }
}
registerProcessor('orfeo-capture', OrfeoCapture);
`;

const START_FRAMES = 3; // ~60 ms por encima del umbral para empezar
const END_FRAMES = 40; // ~850 ms de silencio para cortar
const PRE_ROLL_FRAMES = 15; // ~300 ms antes de empezar (para no cortar la primera sílaba)
const MIN_SPEECH_MS = 400;
const MAX_SPEECH_MS = 15_000;
/** Para cortar: el volumen debe bajar de un % del pico de tu voz (más robusto con ruido de fondo). */
const END_RATIO = 0.25;

export interface HandsFreeOptions {
  /** true mientras Orfeo piensa o habla: no escuchamos (para que no se oiga a sí mismo). */
  paused: boolean;
  onUtterance: (audio: { mimeType: string; data: string }) => void;
}

export function useHandsFree({ paused, onUtterance }: HandsFreeOptions) {
  const [enabled, setEnabled] = useState(false);
  const [hearing, setHearing] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const onUtteranceRef = useRef(onUtterance);
  onUtteranceRef.current = onUtterance;

  useEffect(() => {
    if (!enabled) return;
    let ctx: AudioContext | undefined;
    let stream: MediaStream | undefined;
    let cancelled = false;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          // Sin control automático de ganancia: en los silencios "sube" el ruido y el detector no sabría cuándo cortar
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop()); // (en modo desarrollo React monta dos veces)
          return;
        }
        ctx = new AudioContext();
        const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);

        const source = ctx.createMediaStreamSource(stream);
        const node = new AudioWorkletNode(ctx, 'orfeo-capture');
        const mute = ctx.createGain();
        mute.gain.value = 0; // hay que conectarlo a la salida para que procese, pero en silencio
        source.connect(node).connect(mute).connect(ctx.destination);

        const rate = ctx.sampleRate;
        const frameMs = (1024 / rate) * 1000;
        let noise = 0.01; // nivel de ruido de fondo, se va adaptando
        let speaking = false;
        let above = 0;
        let below = 0;
        let preRoll: Float32Array[] = [];
        let speech: Float32Array[] = [];
        let peak = 0; // volumen máximo de la frase actual

        node.port.onmessage = ({ data }: MessageEvent<Float32Array>) => {
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
          const rms = Math.sqrt(sum / data.length);
          setLevel(rms);

          if (cancelled) return;
          if (pausedRef.current) {
            // Orfeo está hablando/pensando: descartamos lo que oímos
            speaking = false;
            speech = [];
            above = 0;
            setHearing(false);
            return;
          }

          const threshold = Math.max(0.012, noise * 3);
          if (!speaking) {
            noise = noise * 0.95 + rms * 0.05; // aprende el ruido de fondo
            preRoll.push(data);
            if (preRoll.length > PRE_ROLL_FRAMES) preRoll.shift();
            above = rms > threshold ? above + 1 : 0;
            if (above >= START_FRAMES) {
              speaking = true;
              below = 0;
              peak = rms;
              speech = [...preRoll];
              setHearing(true);
            }
            return;
          }

          speech.push(data);
          peak = Math.max(peak, rms);
          // Silencio = por debajo del umbral de ruido O muy por debajo del pico de tu voz
          const endThreshold = Math.max(threshold, peak * END_RATIO);
          below = rms < endThreshold ? below + 1 : 0;
          const durationMs = speech.length * frameMs;
          if (below >= END_FRAMES || durationMs > MAX_SPEECH_MS) {
            speaking = false;
            setHearing(false);
            preRoll = [];
            const voicedMs = durationMs - below * frameMs;
            if (voicedMs >= MIN_SPEECH_MS) {
              const wav = encodeWav(speech, rate);
              onUtteranceRef.current({ mimeType: 'audio/wav', data: bytesToBase64(wav) });
            }
            speech = [];
          }
        };
        setError(null);
      } catch {
        setError('No pude acceder al micrófono. Revisa los permisos del navegador.');
        setEnabled(false);
      }
    })();

    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      setHearing(false);
      setLevel(0);
    };
  }, [enabled]);

  const toggle = useCallback(() => setEnabled((e) => !e), []);
  return { enabled, hearing, level, error, toggle, setEnabled };
}
