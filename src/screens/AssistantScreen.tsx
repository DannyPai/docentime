import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '../lib/types';
import { clearChat, getState, pushMessage, runOps, toast, undo, updateMessage, updateSettings, useAppState } from '../lib/store';
import { greeting, reply, SUGGESTIONS } from '../lib/assistant';
import * as Icon from '../ui/icons';

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

export default function AssistantScreen({ prompt, onPromptUsed }: { prompt: string | null; onPromptUsed: () => void }) {
  const s = useAppState();
  const [draft, setDraft] = useState('');
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<Recognition | null>(null);
  const greet = greeting(s);

  const send = (text?: string) => {
    const t = (text ?? draft).trim();
    if (!t || typing) return;
    setDraft('');
    pushMessage({ from: 'docente', text: t });
    setTyping(true);
    setTimeout(() => {
      const r = reply(getState(), t);
      pushMessage({ from: 'asistente', ...r });
      setTyping(false);
    }, 650 + Math.min(700, t.length * 8));
  };

  useEffect(() => {
    if (prompt) {
      send(prompt);
      onPromptUsed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [s.chat.length, typing]);

  useEffect(() => () => recRef.current?.stop(), []);

  const decide = (m: ChatMessage, ok: boolean) => {
    if (!m.proposal || m.proposal.status !== 'pendiente') return;
    if (ok) {
      runOps(m.proposal.ops);
      // Aprende el horario preferido para calificar.
      for (const op of m.proposal.ops) {
        const a = op.type === 'add' ? op.activity : null;
        if (a && /calific/i.test(a.title)) updateSettings({ preferredGradingHour: a.start });
      }
      updateMessage(m.id, { proposal: { ...m.proposal, status: 'aplicada' } });
      pushMessage({ from: 'asistente', text: m.proposal.doneText });
      toast('Cambio aplicado', {
        label: 'Deshacer',
        run: () => {
          if (undo()) {
            updateMessage(m.id, { proposal: { ...m.proposal!, status: 'cancelada' } });
            pushMessage({ from: 'asistente', text: 'Deshice el cambio; tu calendario quedó como estaba.' });
          }
        }
      });
    } else {
      updateMessage(m.id, { proposal: { ...m.proposal, status: 'cancelada' } });
      pushMessage({ from: 'asistente', text: 'De acuerdo, no cambié nada.' });
    }
  };

  const mic = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) {
      toast('Este navegador no permite dictado aquí. Usa el micrófono del teclado.');
      return;
    }
    const rec = new SR();
    rec.lang = 'es-EC';
    rec.interimResults = true;
    rec.continuous = false;
    let finalText = '';
    rec.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setDraft(text);
      if (e.results[e.results.length - 1].isFinal) finalText = text;
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed') toast('Permite el acceso al micrófono para dictar.');
    };
    rec.onend = () => {
      setListening(false);
      if (finalText.trim()) send(finalText);
    };
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  const messages: (ChatMessage | (typeof greet & { id: string; from: 'asistente' }))[] = s.chat.length ? s.chat : [{ ...greet, id: 'saludo', from: 'asistente' }];

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="row-between" style={{ padding: 'calc(18px + var(--safe-t)) 16px 12px', borderBottom: '1px solid var(--ln)' }}>
        <div className="row">
          <h1 className="h1" style={{ fontSize: 26, margin: 0 }}>Asistente</h1>
          <span className="badge k-comision" style={{ fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>MODO DEMO</span>
        </div>
        {s.chat.length > 0 && (
          <button className="btn-link" onClick={() => { clearChat(); toast('Conversación borrada'); }}>Limpiar</button>
        )}
      </div>

      <div className="chat" ref={listRef} aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={'msg ' + (m.from === 'docente' ? 'me' : 'bot')}>
            <div className="bubble">{m.text}</div>
            {m.list && m.list.length > 0 && (
              <div className="list" style={{ width: '100%' }}>
                {m.list.map((r, i) => (
                  <div key={i} className="li" style={{ minHeight: 44, padding: '8px 14px' }}>
                    <span className="small" style={{ fontWeight: 500 }}>{r.label}</span>
                    <span className="mono" style={{ flex: 'none', textAlign: 'right' }}>{r.value}</span>
                  </div>
                ))}
              </div>
            )}
            {m.proposal && (
              <div className="proposal">
                <div className="eyebrow">Vista previa · {m.proposal.tag}</div>
                <div className="h3">{m.proposal.title}</div>
                {m.proposal.rows.map((r, i) => (
                  <div key={i} className="prop-row"><span>{r.label}</span><span>{r.value}</span></div>
                ))}
                {m.proposal.warning && <div className="warn">{m.proposal.warning}</div>}
                {m.proposal.why && <div className="why"><b style={{ color: 'var(--fg)' }}>Por qué: </b>{m.proposal.why}</div>}
                {m.proposal.status === 'pendiente' ? (
                  <div className="row">
                    <button className="btn btn-sm grow" onClick={() => decide(m as ChatMessage, true)}>Confirmar</button>
                    <button className="btn btn-ghost btn-sm grow" onClick={() => decide(m as ChatMessage, false)}>Cancelar</button>
                  </div>
                ) : m.proposal.status === 'aplicada' ? (
                  <span className="badge badge-ok" style={{ alignSelf: 'flex-start', animation: 'pop .28s both' }}><Icon.Check size={12} /> Aplicado</span>
                ) : (
                  <span className="badge" style={{ alignSelf: 'flex-start', animation: 'pop .28s both' }}>Sin cambios</span>
                )}
              </div>
            )}
            {m.chips && m.chips.length > 0 && m.id === messages[messages.length - 1].id && (
              <div className="row wrap" style={{ width: '100%' }}>
                {m.chips.map((c) => <button key={c} className="chip chip-soft" onClick={() => send(c)}>{c}</button>)}
              </div>
            )}
          </div>
        ))}
        {typing && (
          <div className="typing msg" role="status" aria-label="El asistente está escribiendo"><span /><span /><span /></div>
        )}
      </div>

      {s.chat.length > 0 && (
        <div className="scroll-x" style={{ margin: 0, padding: '0 16px 8px' }}>
          {SUGGESTIONS.map((c) => <button key={c} className="chip chip-soft" onClick={() => send(c)}>{c}</button>)}
        </div>
      )}
      <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <div className="composer-box">
          <input aria-label="Mensaje para el asistente" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={listening ? 'Escuchando…' : 'Escribe o dicta un pedido'} enterKeyHint="send" />
          <button type="button" className={'icon-btn' + (listening ? ' mic-on' : '')} style={{ width: 40, height: 40, border: 'none' }} onClick={mic} aria-label={listening ? 'Detener dictado' : 'Dictar por voz'} aria-pressed={listening}>
            <Icon.Mic size={18} />
          </button>
        </div>
        <button type="submit" className="icon-btn" style={{ width: 48, height: 48, background: 'var(--red)', color: '#fff', border: 'none' }} aria-label="Enviar mensaje" disabled={!draft.trim() || typing}>
          <Icon.Send size={20} />
        </button>
      </form>
    </div>
  );
}
