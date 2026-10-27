import type { Emotion } from '@orfeo/protocol';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useHandsFree } from './audio/useHandsFree';
import { useOrfeoSocket } from './useOrfeoSocket';
import { usePushToTalk } from './usePushToTalk';

/** Cara provisional (en la fase 5 llegan los ojos animados). */
const FACE: Record<Emotion, string> = {
  neutral: '😐', happy: '😊', excited: '🤩', curious: '🤔', thinking: '🧐',
  concerned: '😟', sad: '😢', surprised: '😮', proud: '😌', sleepy: '😴',
};

/** En conversación activa, si no hablas en este tiempo, vuelve a dormir. */
const IDLE_TO_SLEEP_MS = 60_000;

const secs = (ms?: number) => (ms === undefined ? '–' : `${(ms / 1000).toFixed(1)} s`);

export function App() {
  const orfeo = useOrfeoSocket();
  const busy = orfeo.state !== 'idle' || orfeo.speaking;

  const [handsFreeOn, setHandsFreeOn] = useState(false);
  const ptt = usePushToTalk((audio) => orfeo.send({ type: 'user_audio', audio, listen: 'push' }), handsFreeOn);
  const handsFree = useHandsFree({
    paused: busy,
    onUtterance: (audio) => {
      orfeo.send({ type: 'user_audio', audio, listen: orfeo.mode === 'active' ? 'conversation' : 'wake' });
      lastActivity.current = Date.now();
    },
  });

  useEffect(() => setHandsFreeOn(handsFree.enabled), [handsFree.enabled]);

  const [draft, setDraft] = useState('');
  const logEnd = useRef<HTMLDivElement>(null);
  const lastActivity = useRef(Date.now());

  // Con llaves: un efecto solo puede devolver una función de limpieza
  // (en Chrome reciente scrollIntoView devuelve una Promise y React intentaría "ejecutarla").
  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [orfeo.lines]);

  // Conversación activa → dormido tras un rato sin hablar
  useEffect(() => {
    if (!handsFree.enabled || orfeo.mode !== 'active') return;
    lastActivity.current = Date.now();
    const timer = setInterval(() => {
      if (!busy && Date.now() - lastActivity.current > IDLE_TO_SLEEP_MS) orfeo.setMode('sleep');
    }, 5000);
    return () => clearInterval(timer);
  }, [handsFree.enabled, orfeo.mode, busy, orfeo.setMode]);

  // Al activar manos libres, empezamos en conversación (si lo enciendes, es que quieres hablar)
  const toggleHandsFree = () => {
    if (!handsFree.enabled) orfeo.setMode('active');
    handsFree.toggle();
  };

  const listening = ptt.recording || handsFree.hearing;
  const asleep = handsFree.enabled && orfeo.mode === 'sleep';
  const face = listening
    ? '👂'
    : orfeo.state === 'thinking'
      ? FACE.thinking
      : asleep && !busy
        ? FACE.sleepy
        : FACE[orfeo.emotion];

  const label = ptt.recording
    ? 'Te escucho… (suelta para enviar)'
    : handsFree.hearing
      ? 'Te escucho…'
      : orfeo.state === 'transcribing'
        ? 'Entendiendo lo que dijiste…'
        : orfeo.state === 'thinking'
          ? 'Pensando…'
          : orfeo.speaking
            ? 'Hablando…'
            : asleep
              ? 'Dormido — di "Orfeo" para despertarme'
              : handsFree.enabled
                ? 'Conversación activa — habla cuando quieras (di "descansa" para terminar)'
                : 'Mantén pulsado ESPACIO para hablar';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    orfeo.sendText(draft.trim());
    setDraft('');
  };

  return (
    <main className="app">
      <header>
        <h1>Orfeo</h1>
        <span className={`dot ${orfeo.connected ? 'on' : 'off'}`}>{orfeo.connected ? 'conectado' : 'conectando…'}</span>
      </header>

      <section className={`face ${listening ? 'listening' : ''} ${orfeo.speaking ? 'speaking' : ''} ${asleep ? 'asleep' : ''}`}>
        <div className="emoji">{face}</div>
        <p className="state">{label}</p>
        {handsFree.enabled && <div className="level" style={{ width: `${Math.min(100, handsFree.level * 800)}%` }} />}
      </section>

      {orfeo.timings && (
        <p className="timings">
          {orfeo.timings.audioSeconds !== undefined && <>audio {orfeo.timings.audioSeconds.toFixed(1)} s · </>}
          oír {secs(orfeo.timings.stt)} · pensar {secs(orfeo.timings.think)} · empezar a hablar {secs(orfeo.timings.firstAudio)}
        </p>
      )}

      <div className="controls">
        <button className={`toggle ${handsFree.enabled ? 'on' : ''}`} disabled={!orfeo.connected} onClick={toggleHandsFree}>
          {handsFree.enabled ? '🖐️ Manos libres: ON' : '🖐️ Manos libres: OFF'}
        </button>
        {!handsFree.enabled && (
          <button
            className={`talk ${ptt.recording ? 'active' : ''}`}
            disabled={!orfeo.connected || busy}
            onPointerDown={() => void ptt.start()}
            onPointerUp={ptt.stop}
            onPointerLeave={ptt.stop}
          >
            {ptt.recording ? '● Grabando' : '🎙️ Mantén para hablar'}
          </button>
        )}
      </div>
      {(ptt.error || handsFree.error) && <p className="error">{ptt.error ?? handsFree.error}</p>}
      {!orfeo.connected && (
        <p className="error">
          No encuentro el cerebro de Orfeo. ¿Está corriendo <code>pnpm dev</code>? (<code>pnpm chat</code> no abre el WebSocket)
        </p>
      )}

      <section className="log">
        {orfeo.lines.map((l) => (
          <p key={l.id} className={`line ${l.who}`}>
            {l.who === 'orfeo' && <span className="who">{FACE[l.emotion ?? 'neutral']} </span>}
            {l.text}
          </p>
        ))}
        <div ref={logEnd} />
      </section>

      <form className="type" onSubmit={submit}>
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="…o escríbele" disabled={!orfeo.connected} />
        <button type="submit" disabled={!orfeo.connected || busy}>Enviar</button>
      </form>

      {orfeo.confirms[0] && (
        <div className="modal">
          <div className="card">
            <h2>¿Envío este correo?</h2>
            <p><b>Para:</b> {orfeo.confirms[0].to}</p>
            <p><b>Asunto:</b> {orfeo.confirms[0].subject}</p>
            <pre>{orfeo.confirms[0].body}</pre>
            <div className="actions">
              <button className="no" onClick={() => orfeo.answerConfirm(orfeo.confirms[0].draftId, false)}>No, déjalo en borrador</button>
              <button className="yes" onClick={() => orfeo.answerConfirm(orfeo.confirms[0].draftId, true)}>Sí, enviar</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
