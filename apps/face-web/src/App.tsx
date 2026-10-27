import type { Emotion } from '@orfeo/protocol';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useOrfeoSocket } from './useOrfeoSocket';
import { usePushToTalk } from './usePushToTalk';

/** Cara provisional (en la fase 5 llegan los ojos animados). */
const FACE: Record<Emotion, string> = {
  neutral: '😐', happy: '😊', excited: '🤩', curious: '🤔', thinking: '🧐',
  concerned: '😟', sad: '😢', surprised: '😮', proud: '😌', sleepy: '😴',
};

const STATE_LABEL = {
  idle: 'Mantén pulsado ESPACIO para hablar',
  transcribing: 'Escuchando lo que dijiste…',
  thinking: 'Pensando…',
  speaking: 'Hablando…',
} as const;

export function App() {
  const orfeo = useOrfeoSocket();
  const ptt = usePushToTalk((audio) => orfeo.send({ type: 'user_audio', audio }));
  const [draft, setDraft] = useState('');
  const logEnd = useRef<HTMLDivElement>(null);

  // Con llaves: un efecto solo puede devolver una función de limpieza
  // (en Chrome reciente scrollIntoView devuelve una Promise y React intentaría "ejecutarla").
  useEffect(() => {
    logEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [orfeo.lines]);

  const busy = orfeo.state !== 'idle';
  const face = ptt.recording ? '👂' : orfeo.state === 'thinking' ? FACE.thinking : FACE[orfeo.emotion];
  const label = ptt.recording ? 'Te escucho… (suelta para enviar)' : orfeo.speaking ? STATE_LABEL.speaking : STATE_LABEL[orfeo.state];

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

      <section className={`face ${ptt.recording ? 'listening' : ''} ${orfeo.speaking ? 'speaking' : ''}`}>
        <div className="emoji">{face}</div>
        <p className="state">{label}</p>
      </section>

      <button
        className={`talk ${ptt.recording ? 'active' : ''}`}
        disabled={!orfeo.connected || busy}
        onPointerDown={() => void ptt.start()}
        onPointerUp={ptt.stop}
        onPointerLeave={ptt.stop}
      >
        {ptt.recording ? '● Grabando' : '🎙️ Mantén para hablar'}
      </button>
      {ptt.error && <p className="error">{ptt.error}</p>}
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
