'use client';
import React, { use, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { BellRing, Check, Copy, Crown, Loader2, LogOut, Play, Volume2, WifiOff, X } from 'lucide-react';
import { useRouter } from '../../../../i18n/navigation';
import { PageHero } from '../../../../components/PageHero';
import { GuessAutocomplete } from '../../../../components/GuessAutocomplete';
import {
  ErrorText,
  FieldLabel,
  PrimaryButton,
  RoomCard,
  SecondaryButton,
  textInputClass,
  textInputStyle,
} from '../../../../components/room/RoomControls';
import { useRoom, useServerNow } from '../../../../hooks/useRoom';
import { useRoomAudio } from '../../../../hooks/useRoomAudio';
import { ROOM_LIMITS, type RoomPlayerView, type RoomView } from '../../../../shared/roomTypes';

const secondsUntil = (target: number | undefined, now: number) =>
  target === undefined ? 0 : Math.max(0, Math.ceil((target - now) / 1000));

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = use(params);
  const code = rawCode.toUpperCase();
  const t = useTranslations('Room');
  const router = useRouter();
  const room = useRoom(code);
  const { view } = room;

  const inRound = view?.phase === 'countdown' || view?.phase === 'guessing' || view?.phase === 'reveal';
  const now = useServerNow(room.offsetMs, Boolean(inRound));
  const playsHere = Boolean(view && (view.settings.audio === 'everyone' || view.me.isHost));
  const audio = useRoomAudio({
    // Buzzer: the clip stops while someone holds the buzzer, so they can think.
    enabled: playsHere && (view?.phase === 'countdown' || view?.phase === 'guessing') && !view?.buzz?.holderId,
    audioUrl: view?.audioUrl,
    playAt: view?.playAt,
    clipSeconds: view?.settings.clipSeconds ?? 5,
    offsetMs: room.offsetMs,
  });

  // iOS: unlock audio on the first tap anywhere on the page.
  useEffect(() => {
    if (!playsHere) return;
    const onTap = () => void audio.unlock();
    document.addEventListener('touchend', onTap, { once: true });
    document.addEventListener('click', onTap, { once: true });
    return () => {
      document.removeEventListener('touchend', onTap);
      document.removeEventListener('click', onTap);
    };
  }, [audio.unlock, playsHere]); // eslint-disable-line react-hooks/exhaustive-deps

  const leave = async () => {
    audio.stop();
    await room.leave();
    router.push('/room');
  };

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center gap-4 pb-10">
      <PageHero title={t('title')} tagline={t('tagline')} gradient="from-cyan-200 via-teal-300 to-emerald-400" />

      {room.offline && (
        <p role="status" className="flex items-center gap-2 text-sm font-bold" style={{ color: '#fbbf24' }}>
          <WifiOff className="w-4 h-4" aria-hidden="true" /> {t('errors.network')}
        </p>
      )}

      {!view ? (
        <JoinPanel code={code} room={room} />
      ) : view.phase === 'lobby' ? (
        <Lobby view={view} busy={room.busy} onStart={() => { void audio.unlock(); void room.start(); }} onLeave={leave} />
      ) : view.phase === 'finished' ? (
        <Finished view={view} busy={room.busy} onStart={() => { void audio.unlock(); void room.start(); }} onLeave={leave} />
      ) : (
        <Round view={view} now={now} room={room} audio={audio} playsHere={playsHere} />
      )}

      {view && room.error && room.error !== 'network' && <ErrorText>{t(`errors.${room.error}`)}</ErrorText>}
    </div>
  );
}

type RoomApi = ReturnType<typeof useRoom>;
type AudioApi = ReturnType<typeof useRoomAudio>;

function JoinPanel({ code, room }: { code: string; room: RoomApi }) {
  const t = useTranslations('Room');
  const [name, setName] = useState('');
  useEffect(() => setName((n) => n || room.savedName), [room.savedName]);

  if (room.error === 'notFound' || room.error === 'unavailable') {
    return (
      <RoomCard>
        <ErrorText>{t(`errors.${room.error}`)}</ErrorText>
      </RoomCard>
    );
  }
  if (!room.preview) {
    return <Loader2 className="w-8 h-8 animate-spin mt-10" style={{ color: 'var(--song-accent-text)' }} aria-label="Loading" />;
  }
  return (
    <RoomCard>
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) void room.join(name);
        }}
      >
        <h2 className="text-lg font-extrabold" style={{ color: 'var(--song-text)' }}>{t('join.headingCode', { code })}</h2>
        <p className="text-sm" style={{ color: 'var(--song-muted)' }}>{t('join.playersIn', { count: room.preview.players })}</p>
        {room.preview.started && <p className="text-sm font-bold" style={{ color: 'var(--song-accent-text)' }}>{t('join.inProgress')}</p>}
        <div>
          <FieldLabel htmlFor="room-join-name">{t('create.name')}</FieldLabel>
          <input
            id="room-join-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={ROOM_LIMITS.nameMaxLength}
            placeholder={t('create.namePlaceholder')}
            autoComplete="nickname"
            className={textInputClass}
            style={textInputStyle}
          />
        </div>
        {room.preview.full ? (
          <ErrorText>{t('errors.full')}</ErrorText>
        ) : (
          <PrimaryButton type="submit" disabled={room.busy || !name.trim()}>
            {room.busy ? t('join.joining') : t('join.submit')}
          </PrimaryButton>
        )}
        {room.error && room.error !== 'network' && <ErrorText>{t(`errors.${room.error}`)}</ErrorText>}
      </form>
    </RoomCard>
  );
}

function PlayerList({ players, showRound }: { players: RoomPlayerView[]; showRound?: boolean }) {
  const t = useTranslations('Room');
  return (
    <ol className="flex flex-col gap-1.5">
      {players.map((p, idx) => (
        <li
          key={p.id}
          className="flex items-center gap-3 rounded-xl border px-3 py-2"
          style={{
            borderColor: p.isMe ? 'var(--song-accent)' : 'var(--song-border)',
            backgroundColor: 'var(--song-surface-soft)',
            opacity: p.left ? 0.5 : 1,
          }}
        >
          <span className="w-5 text-sm font-black tabular-nums" style={{ color: 'var(--song-muted)' }}>{idx + 1}</span>
          <span className="flex-1 min-w-0 truncate font-bold" style={{ color: 'var(--song-text)' }}>
            {p.name}
            {p.isMe && <span className="ml-1.5 text-xs font-bold" style={{ color: 'var(--song-muted)' }}>({t('lobby.you')})</span>}
          </span>
          {p.isHost && <Crown className="w-4 h-4 shrink-0" style={{ color: '#fbbf24' }} aria-label={t('lobby.host')} />}
          {p.left && <span className="text-xs font-bold" style={{ color: 'var(--song-muted)' }}>{t('lobby.left')}</span>}
          {showRound && p.roundCorrect !== undefined && (
            <span className="text-xs font-extrabold tabular-nums" style={{ color: p.roundCorrect ? '#22c55e' : 'var(--song-muted)' }}>
              {p.roundCorrect ? `+${p.roundPoints}` : t('game.missed')}
            </span>
          )}
          {!showRound && p.done && <Check className="w-4 h-4 shrink-0" style={{ color: '#22c55e' }} aria-hidden="true" />}
          <span className="w-14 text-right font-black tabular-nums" style={{ color: 'var(--song-text)' }}>{p.score}</span>
        </li>
      ))}
    </ol>
  );
}

function Lobby({ view, busy, onStart, onLeave }: { view: RoomView; busy: boolean; onStart: () => void; onLeave: () => void }) {
  const t = useTranslations('Room');
  const [copied, setCopied] = useState(false);
  const active = view.players.filter((p) => !p.left);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <RoomCard className="flex flex-col gap-4">
      <div className="text-center">
        <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>{t('lobby.code')}</p>
        <p className="text-4xl font-black tracking-[0.3em] mt-1" style={{ color: 'var(--song-accent-text)' }}>{view.code}</p>
        <p className="text-xs mt-2" style={{ color: 'var(--song-muted)' }}>
          {t('lobby.summary', {
            mode: t(`mode.${view.settings.mode}`),
            rounds: view.settings.rounds,
            clip: view.settings.clipSeconds,
            where: view.settings.audio === 'host' ? t('create.audioHost') : t('create.audioEveryone'),
          })}
        </p>
        <div className="mt-3 flex justify-center">
          <SecondaryButton onClick={copyLink}>
            <span className="flex items-center gap-2">
              {copied ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
              <span aria-live="polite">{copied ? t('lobby.copied') : t('lobby.copyLink')}</span>
            </span>
          </SecondaryButton>
        </div>
      </div>
      <div>
        <h2 className="text-sm font-extrabold mb-2" style={{ color: 'var(--song-text)' }}>{t('lobby.players', { count: active.length })}</h2>
        <PlayerList players={view.players} />
      </div>
      {view.me.isHost ? (
        <PrimaryButton onClick={onStart} disabled={busy}>
          <span className="flex items-center justify-center gap-2">
            <Play className="w-4 h-4" aria-hidden="true" /> {busy ? t('lobby.starting') : t('lobby.start')}
          </span>
        </PrimaryButton>
      ) : (
        <p className="text-center text-sm font-bold" role="status" style={{ color: 'var(--song-muted)' }}>{t('lobby.waitHost')}</p>
      )}
      <div className="flex justify-center">
        <SecondaryButton onClick={onLeave}>
          <span className="flex items-center gap-2"><LogOut className="w-4 h-4" aria-hidden="true" /> {t('lobby.leave')}</span>
        </SecondaryButton>
      </div>
    </RoomCard>
  );
}

function Round({ view, now, room, audio, playsHere }: { view: RoomView; now: number; room: RoomApi; audio: AudioApi; playsHere: boolean }) {
  const t = useTranslations('Room');
  const active = view.players.filter((p) => !p.left);
  const doneCount = active.filter((p) => p.done).length;
  const outOfTries = !view.me.correct && view.me.attempts >= ROOM_LIMITS.maxAttempts;
  const canGuess = view.phase === 'guessing' && !view.me.correct && !outOfTries;
  const windowMs = view.settings.answerSeconds * 1000;
  const remaining = view.endsAt !== undefined ? Math.max(0, view.endsAt - now) : 0;

  return (
    <>
      <RoomCard className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-extrabold" style={{ color: 'var(--song-text)' }}>
            {t('game.round', { current: view.roundIndex + 1, total: view.totalRounds })}
          </p>
          {view.phase === 'guessing' && (
            <p className="text-sm font-black tabular-nums" style={{ color: remaining < 5000 ? '#f87171' : 'var(--song-accent-text)' }}>
              {t('game.timeLeft', { seconds: Math.ceil(remaining / 1000) })}
            </p>
          )}
        </div>

        {view.phase === 'guessing' && (
          <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'var(--song-surface-soft)' }} aria-hidden="true">
            <div className="h-full rounded-full" style={{ width: `${(remaining / windowMs) * 100}%`, backgroundColor: 'var(--song-accent)', transition: 'width 0.2s linear' }} />
          </div>
        )}

        {view.phase === 'countdown' && (
          <p className="text-center text-3xl font-black py-6" role="status" style={{ color: 'var(--song-accent-text)' }}>
            {t('game.countdown', { seconds: secondsUntil(view.playAt, now) })}
          </p>
        )}

        {view.phase !== 'reveal' && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {!playsHere ? (
              <p className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--song-muted)' }}>
                <Volume2 className="w-4 h-4" aria-hidden="true" /> {t('game.listenHost')}
              </p>
            ) : audio.needsTap ? (
              <PrimaryButton onClick={() => { void audio.unlock().then(() => audio.replay()); }}>
                <span className="flex items-center justify-center gap-2"><Volume2 className="w-4 h-4" aria-hidden="true" /> {t('game.enableSound')}</span>
              </PrimaryButton>
            ) : view.phase === 'guessing' ? (
              <SecondaryButton onClick={() => void audio.replay()}>
                <span className="flex items-center gap-2"><Play className="w-4 h-4" aria-hidden="true" /> {t('game.replay')}</span>
              </SecondaryButton>
            ) : null}
          </div>
        )}

        {view.phase === 'reveal' && view.reveal ? (
          <div className="flex items-center gap-4">
            {view.reveal.artworkUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={view.reveal.artworkUrl} alt="" width={72} height={72} className="w-[72px] h-[72px] rounded-xl object-cover" />
            )}
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>{t('game.theSongWas')}</p>
              <p className="text-lg font-extrabold truncate" style={{ color: 'var(--song-text)' }}>{view.reveal.title}</p>
              <p className="text-sm truncate" style={{ color: 'var(--song-muted)' }}>{view.reveal.artistName}</p>
              <p className="text-xs mt-1 font-bold" style={{ color: 'var(--song-accent-text)' }}>{t('game.nextIn', { seconds: secondsUntil(view.revealEndsAt, now) })}</p>
            </div>
          </div>
        ) : view.settings.mode === 'buzzer' ? (
          <BuzzerArea view={view} now={now} room={room} />
        ) : (
          <>
            {canGuess || view.phase === 'countdown' ? (
              <GuessAutocomplete
                category={view.settings.category}
                mode={view.settings.artistName ? 'artist' : 'standard'}
                artistFilter={view.settings.artistName}
                onSelectGuess={(song) => void room.answer(song)}
                nextStageSeconds={null}
                disabled={!canGuess}
                submitting={room.busy}
              />
            ) : null}
            <div role="status" aria-live="polite" className="text-center text-sm font-extrabold min-h-5">
              {view.me.correct ? (
                <span style={{ color: '#22c55e' }}>{t('game.correct', { points: view.me.points })}</span>
              ) : outOfTries ? (
                <span style={{ color: '#f87171' }}>{t('game.out')}</span>
              ) : room.lastAnswer && !room.lastAnswer.correct && view.me.attempts > 0 ? (
                <span className="inline-flex items-center gap-1" style={{ color: '#fbbf24' }}>
                  <X className="w-4 h-4" aria-hidden="true" /> {t('game.wrong', { left: ROOM_LIMITS.maxAttempts - view.me.attempts })}
                </span>
              ) : null}
            </div>
            {(view.me.correct || outOfTries) && (
              <p className="text-center text-xs font-bold" style={{ color: 'var(--song-muted)' }}>{t('game.waiting')}</p>
            )}
          </>
        )}
      </RoomCard>

      <RoomCard>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-extrabold" style={{ color: 'var(--song-text)' }}>{t('game.scoreboard')}</h2>
          {view.phase === 'guessing' && (
            <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--song-muted)' }}>{t('game.done', { done: doneCount, total: active.length })}</span>
          )}
        </div>
        <PlayerList players={view.players} showRound={view.phase === 'reveal'} />
      </RoomCard>
    </>
  );
}

function BuzzerArea({ view, now, room }: { view: RoomView; now: number; room: RoomApi }) {
  const t = useTranslations('Room');
  const b = view.buzz;
  const canBuzz = Boolean(b?.canBuzz);
  const { buzz } = room;

  // Space buzzes (unless typing in a field).
  useEffect(() => {
    if (!canBuzz) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      void buzz();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canBuzz, buzz]);

  const status = (text: string, color: string) => (
    <p role="status" aria-live="polite" className="text-center text-base font-extrabold py-2" style={{ color }}>{text}</p>
  );

  if (view.me.correct) return status(t('game.correct', { points: view.me.points }), '#22c55e');

  if (b?.holderId && b.holderId === view.me.id) {
    return (
      <div className="flex flex-col gap-3">
        {status(t('game.yourTurn', { seconds: secondsUntil(b.deadline, now) }), 'var(--song-accent-text)')}
        <GuessAutocomplete
          category={view.settings.category}
          mode={view.settings.artistName ? 'artist' : 'standard'}
          artistFilter={view.settings.artistName}
          onSelectGuess={(song) => void room.answer(song)}
          nextStageSeconds={null}
          submitting={room.busy}
        />
      </div>
    );
  }
  if (b?.holderId) return status(t('game.answering', { name: b.holderName ?? '…' }), '#fbbf24');
  if (b?.lockedOut) {
    return status(view.me.attempts > 0 ? t('game.buzzWrong') : t('game.lockedOut'), '#f87171');
  }

  const ready = view.phase === 'guessing' && canBuzz;
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <button
        type="button"
        onClick={() => void buzz()}
        disabled={!ready || room.busy}
        aria-describedby="buzz-hint"
        className="w-40 h-40 rounded-full text-3xl font-black shadow-2xl transition active:scale-95 hover:brightness-110 disabled:opacity-40 flex flex-col items-center justify-center gap-1"
        style={{ backgroundColor: '#ef4444', color: '#ffffff', boxShadow: ready ? '0 0 0 6px rgba(239,68,68,0.25)' : undefined }}
      >
        <BellRing className="w-9 h-9" aria-hidden="true" />
        {t('game.buzz')}
      </button>
      <p id="buzz-hint" className="text-xs font-bold" style={{ color: 'var(--song-muted)' }}>{t('game.buzzHint')}</p>
    </div>
  );
}

function Finished({ view, busy, onStart, onLeave }: { view: RoomView; busy: boolean; onStart: () => void; onLeave: () => void }) {
  const t = useTranslations('Room');
  const winner = view.players.find((p) => !p.left) ?? view.players[0];
  return (
    <RoomCard className="flex flex-col gap-4">
      <div className="text-center">
        <p className="text-[11px] font-black uppercase tracking-wider" style={{ color: 'var(--song-muted)' }}>{t('finished.heading')}</p>
        {winner && (
          <p className="text-2xl font-black mt-1 flex items-center justify-center gap-2" style={{ color: 'var(--song-text)' }}>
            <Crown className="w-6 h-6" style={{ color: '#fbbf24' }} aria-hidden="true" /> {t('finished.winner', { name: winner.name })}
          </p>
        )}
      </div>
      <PlayerList players={view.players} />
      {view.me.isHost ? (
        <PrimaryButton onClick={onStart} disabled={busy}>{busy ? t('lobby.starting') : t('finished.playAgain')}</PrimaryButton>
      ) : (
        <p className="text-center text-sm font-bold" role="status" style={{ color: 'var(--song-muted)' }}>{t('finished.waitRematch')}</p>
      )}
      <div className="flex justify-center">
        <SecondaryButton onClick={onLeave}>
          <span className="flex items-center gap-2"><LogOut className="w-4 h-4" aria-hidden="true" /> {t('lobby.leave')}</span>
        </SecondaryButton>
      </div>
    </RoomCard>
  );
}
