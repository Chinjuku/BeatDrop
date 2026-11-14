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
import { Modal } from '../../../../components/Modal';
import { PauseButton, PausedOverlay, PauseRequestDialog } from '../../../../components/room/PauseControls';
import { useRoom, useServerNow } from '../../../../hooks/useRoom';
import { useRoomAudio } from '../../../../hooks/useRoomAudio';
import { CORRECT_POP_MS, useCorrectFeed } from '../../../../hooks/useCorrectFeed';
import { CorrectToast } from '../../../../components/room/CorrectToast';
import { CorrectBurst } from '../../../../components/room/CorrectBurst';
import { playerColor } from '../../../../shared/roomColors';
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
    // Any freeze (a pause, or a buzz hold so the holder can think) stops the clip; the next
    // `audioCue` resumes it from where it stopped on every playing device.
    enabled: playsHere && (view?.phase === 'countdown' || view?.phase === 'guessing') && !view?.frozen,
    audioUrl: view?.audioUrl,
    cueAt: view?.audioCue?.at,
    cueFromSeconds: view?.audioCue?.fromSeconds ?? 0,
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

  // Mid-game, leaving asks first. The dialog closes by itself if the game ends meanwhile.
  const [confirmLeave, setConfirmLeave] = useState(false);
  // A game that ends while the dialog is open must not reopen it at the next rematch countdown.
  useEffect(() => {
    if (!inRound) setConfirmLeave(false);
  }, [inRound]);
  const leave = async () => {
    setConfirmLeave(false);
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
        <Round view={view} now={now} room={room} audio={audio} playsHere={playsHere} onLeave={() => setConfirmLeave(true)} />
      )}

      <Modal
        open={confirmLeave && inRound}
        onClose={() => setConfirmLeave(false)}
        title={t('leaveConfirm.title')}
        description={t('leaveConfirm.body')}
        panelClassName="!w-[calc(100vw-24px)] sm:!max-w-sm !p-5 sm:!p-6"
      >
        <div className="flex flex-col gap-4">
          <div>
            {/* Modal names and describes the dialog (sr-only); hide the visible copy so it is read once. */}
            <h2 aria-hidden="true" className="text-lg font-extrabold">{t('leaveConfirm.title')}</h2>
            <p aria-hidden="true" className="mt-2 text-sm" style={{ color: 'var(--modal-muted)' }}>{t('leaveConfirm.body')}</p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              data-autofocus
              onClick={() => setConfirmLeave(false)}
              className="min-h-11 rounded-xl border px-4 text-sm font-bold"
              style={{ backgroundColor: 'var(--modal-elevated)', borderColor: 'var(--modal-border)' }}
            >
              {t('leaveConfirm.stay')}
            </button>
            <button
              type="button"
              onClick={() => void leave()}
              disabled={room.busy}
              className="min-h-11 rounded-xl bg-rose-600 px-4 text-sm font-extrabold text-white disabled:opacity-50"
            >
              {t('leaveConfirm.leave')}
            </button>
          </div>
        </div>
      </Modal>

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

function PlayerList({ players, showRound, pops }: { players: RoomPlayerView[]; showRound?: boolean; pops?: Map<string, { points: number; at: number }> }) {
  const t = useTranslations('Room');
  return (
    <ol className="flex flex-col gap-1.5">
      {players.map((p, idx) => {
        const color = playerColor(p.colorIndex, p.isMe);
        const pop = pops?.get(p.id);
        return (
        <li
          key={p.id}
          className={`relative flex items-center gap-3 rounded-xl border px-3 py-2${pop ? ' bd-row-pop z-10' : ''}`}
          style={{
            borderColor: p.isMe ? 'var(--song-accent)' : 'var(--song-border)',
            backgroundColor: 'var(--song-surface-soft)',
            opacity: p.left ? 0.5 : 1,
            ['--pop-color' as string]: color,
            ['--bd-dur' as string]: `${CORRECT_POP_MS}ms`,
          }}
        >
          {pop && (
            <span key={pop.at} aria-hidden="true" className="bd-float-points pointer-events-none absolute right-16 top-0 text-sm font-black" style={{ color }}>
              +{pop.points}
            </span>
          )}
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
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
        );
      })}
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

function Round({
  view,
  now,
  room,
  audio,
  playsHere,
  onLeave,
}: {
  view: RoomView;
  now: number;
  room: RoomApi;
  audio: AudioApi;
  playsHere: boolean;
  onLeave: () => void;
}) {
  const t = useTranslations('Room');
  const active = view.players.filter((p) => !p.left);
  const doneCount = active.filter((p) => p.done).length;
  const outOfTries = !view.me.correct && view.me.attempts >= ROOM_LIMITS.maxAttempts;
  const canGuess = view.phase === 'guessing' && !view.me.correct && !outOfTries;
  // Inputs lock on a pause only: during a buzz hold (also `frozen`) the holder must still answer.
  const paused = Boolean(view.pause);
  const windowMs = view.settings.answerSeconds * 1000;
  const feed = useCorrectFeed(view, now);
  const colorIndexOf = (id: string) => view.players.find((p) => p.id === id)?.colorIndex ?? 0;
  const isBuzzer = view.settings.mode === 'buzzer';
  // Row pop (everyone-answers mode): derived from the feed, no extra timers.
  const pops = new Map<string, { points: number; at: number }>();
  if (!isBuzzer) for (const e of feed) if (now - e.at < CORRECT_POP_MS) pops.set(e.playerId, { points: e.points, at: e.at });
  const remaining = view.endsAt !== undefined ? Math.max(0, view.endsAt - now) : 0;

  return (
    <>
      <RoomCard className="relative flex flex-col gap-4">
        {view.pause && <PausedOverlay pause={view.pause} now={now} isHost={view.me.isHost} busy={room.busy} onPause={room.pause} />}
        {isBuzzer ? (
          <CorrectBurst entries={feed} meId={view.me.id} roundIndex={view.roundIndex} colorIndexOf={colorIndexOf} />
        ) : (
          <CorrectToast entries={feed} meId={view.me.id} roundIndex={view.roundIndex} colorIndexOf={colorIndexOf} />
        )}
        {/* One polite live region announces each new correct answer once. */}
        <div className="sr-only" aria-live="polite" aria-relevant="additions">
          {feed.map((e) => (
            <p key={`${e.playerId}:${e.at}`}>
              {e.playerId === view.me.id ? t('game.gotItMe', { points: e.points }) : t('game.gotIt', { name: e.name, points: e.points })}
            </p>
          ))}
        </div>
        {/* The overlay blocks what is behind it: no focus, clicks or typing while paused. */}
        <div className="flex flex-col gap-4" inert={paused}>
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
                <PrimaryButton onClick={() => { void audio.unlock().then(() => { if (!paused) void audio.replay(); }); }}>
                  <span className="flex items-center justify-center gap-2"><Volume2 className="w-4 h-4" aria-hidden="true" /> {t('game.enableSound')}</span>
                </PrimaryButton>
              ) : view.phase === 'guessing' ? (
                <SecondaryButton onClick={() => void audio.replay()} disabled={paused}>
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
            <BuzzerArea view={view} now={now} room={room} paused={paused} />
          ) : (
            <>
              {canGuess || view.phase === 'countdown' ? (
                <GuessAutocomplete
                  category={view.settings.category}
                  mode={view.settings.artistName ? 'artist' : 'standard'}
                  artistFilter={view.settings.artistName}
                  onSelectGuess={(song) => void room.answer(song)}
                  nextStageSeconds={null}
                  disabled={!canGuess || paused}
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

          {!view.pause && (
            <div className="flex justify-center border-t pt-3" style={{ borderColor: 'var(--song-border)' }}>
              <PauseButton view={view} busy={room.busy} onPause={room.pause} />
            </div>
          )}
        </div>
      </RoomCard>

      {view.me.isHost && <PauseRequestDialog request={view.pauseRequest} now={now} busy={room.busy} onPause={room.pause} />}

      <RoomCard>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-extrabold" style={{ color: 'var(--song-text)' }}>{t('game.scoreboard')}</h2>
          {view.phase === 'guessing' && (
            <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--song-muted)' }}>{t('game.done', { done: doneCount, total: active.length })}</span>
          )}
        </div>
        <PlayerList players={view.players} showRound={view.phase === 'reveal'} pops={pops} />
        <div className="mt-3 flex justify-center">
          <SecondaryButton onClick={onLeave}>
            <span className="flex items-center gap-2"><LogOut className="w-4 h-4" aria-hidden="true" /> {t('lobby.leave')}</span>
          </SecondaryButton>
        </div>
      </RoomCard>
    </>
  );
}

function BuzzerArea({ view, now, room, paused }: { view: RoomView; now: number; room: RoomApi; paused: boolean }) {
  const t = useTranslations('Room');
  const b = view.buzz;
  const canBuzz = Boolean(b?.canBuzz) && !paused;
  const { buzz } = room;

  // Space buzzes (unless typing in a field).
  useEffect(() => {
    if (!canBuzz) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Never buzz from inside, or behind, an open dialog (e.g. the host's break request).
      if (target?.closest?.('[role="dialog"]') || document.querySelector('[data-modal-root]')) return;
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
          disabled={paused}
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
        {view.endedEarly && (
          <p className="text-sm font-bold mt-2" style={{ color: 'var(--song-muted)' }}>{t('finished.endedEarly')}</p>
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
