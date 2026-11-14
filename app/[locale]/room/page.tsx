'use client';
import React, { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Users } from 'lucide-react';
import { useRouter } from '../../../i18n/navigation';
import { PageHero } from '../../../components/PageHero';
import {
  ErrorText,
  FieldLabel,
  PrimaryButton,
  RoomCard,
  Segmented,
  textInputClass,
  textInputStyle,
} from '../../../components/room/RoomControls';
import { errorKeyFor, saveRoomCredentials, type RoomErrorKey } from '../../../hooks/useRoom';
import { DEFAULT_ROOM_SETTINGS, ROOM_LIMITS, type RoomAudio, type RoomMode, type RoomSettings } from '../../../shared/roomTypes';
import type { CategoryType, DifficultyLevel } from '../../../shared/types';

const DIFFICULTIES: DifficultyLevel[] = ['easy', 'medium', 'hard', 'expert', 'impossible'];
const DIFFICULTY_LABEL: Record<DifficultyLevel, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
  expert: 'Expert',
  impossible: 'Impossible',
};

export default function RoomHomePage() {
  const t = useTranslations('Room');
  const router = useRouter();
  const [name, setName] = useState('');
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_ROOM_SETTINGS);
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [createError, setCreateError] = useState<RoomErrorKey | null>(null);
  const [joinError, setJoinError] = useState<RoomErrorKey | 'code' | null>(null);

  const update = <K extends keyof RoomSettings>(key: K, value: RoomSettings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setCreateError('name');
    setBusy('create');
    setCreateError(null);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, settings }),
      });
      const json = await res.json().catch(() => null);
      const code = json?.data?.room?.code;
      if (!res.ok || typeof code !== 'string' || typeof json?.data?.playerToken !== 'string') {
        setCreateError(errorKeyFor(res.status, json?.message));
        return;
      }
      saveRoomCredentials(code, { token: json.data.playerToken, name: name.trim() });
      router.push(`/room/${code}`);
    } catch {
      setCreateError('network');
    } finally {
      setBusy(null);
    }
  };

  const joinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{5}$/.test(code)) return setJoinError('code');
    if (!joinName.trim()) return setJoinError('name');
    setBusy('join');
    setJoinError(null);
    try {
      const res = await fetch(`/api/rooms/${code}/join`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: joinName }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || typeof json?.data?.playerToken !== 'string') {
        setJoinError(errorKeyFor(res.status, json?.message));
        return;
      }
      saveRoomCredentials(code, { token: json.data.playerToken, name: joinName.trim() });
      router.push(`/room/${code}`);
    } catch {
      setJoinError('network');
    } finally {
      setBusy(null);
    }
  };

  const audioOptions: Array<{ value: RoomAudio; label: string; hint: string }> = [
    { value: 'host', label: t('create.audioHost'), hint: t('create.audioHostHint') },
    { value: 'everyone', label: t('create.audioEveryone'), hint: t('create.audioEveryoneHint') },
  ];
  const modeOptions: Array<{ value: RoomMode; label: string; hint: string }> = [
    { value: 'answer', label: t('create.modeAnswer'), hint: t('create.modeAnswerHint') },
    { value: 'buzzer', label: t('create.modeBuzzer'), hint: t('create.modeBuzzerHint') },
  ];
  const categoryOptions: Array<{ value: CategoryType; label: string }> = (['all', 'thai', 'international'] as const).map(
    (c) => ({ value: c, label: t(`categories.${c}`) })
  );

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center gap-4 pb-10">
      <PageHero
        title={t('title')}
        tagline={t('tagline')}
        gradient="from-cyan-200 via-teal-300 to-emerald-400"
      />

      <RoomCard>
        <form onSubmit={joinRoom} className="flex flex-col gap-3" noValidate>
          <h2 className="text-lg font-extrabold" style={{ color: 'var(--song-text)' }}>{t('join.heading')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel htmlFor="join-code">{t('join.code')}</FieldLabel>
              <input
                id="join-code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, ROOM_LIMITS.codeLength))}
                placeholder={t('join.codePlaceholder')}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                inputMode="text"
                className={`${textInputClass} tracking-[0.3em] uppercase`}
                style={textInputStyle}
              />
            </div>
            <div>
              <FieldLabel htmlFor="join-name">{t('create.name')}</FieldLabel>
              <input
                id="join-name"
                value={joinName}
                onChange={(e) => setJoinName(e.target.value)}
                maxLength={ROOM_LIMITS.nameMaxLength}
                placeholder={t('create.namePlaceholder')}
                autoComplete="nickname"
                className={textInputClass}
                style={textInputStyle}
              />
            </div>
          </div>
          {joinError && <ErrorText>{t(`errors.${joinError}`)}</ErrorText>}
          <PrimaryButton type="submit" disabled={busy !== null}>
            {busy === 'join' ? t('join.joining') : t('join.submit')}
          </PrimaryButton>
        </form>
      </RoomCard>

      <RoomCard>
        <form onSubmit={createRoom} className="flex flex-col gap-4" noValidate>
          <h2 className="text-lg font-extrabold flex items-center gap-2" style={{ color: 'var(--song-text)' }}>
            <Users className="w-5 h-5" style={{ color: 'var(--song-accent-text)' }} aria-hidden="true" />
            {t('create.heading')}
          </h2>
          <div>
            <FieldLabel htmlFor="host-name">{t('create.name')}</FieldLabel>
            <input
              id="host-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={ROOM_LIMITS.nameMaxLength}
              placeholder={t('create.namePlaceholder')}
              autoComplete="nickname"
              className={textInputClass}
              style={textInputStyle}
            />
          </div>
          <Segmented label={t('create.mode')} value={settings.mode} options={modeOptions} onChange={(v) => update('mode', v)} />
          <Segmented label={t('create.where')} value={settings.audio} options={audioOptions} onChange={(v) => update('audio', v)} />
          <Segmented label={t('create.songs')} value={settings.category} options={categoryOptions} onChange={(v) => update('category', v)} />
          <Segmented
            label={t('create.difficulty')}
            value={settings.difficulty}
            options={DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }))}
            onChange={(v) => update('difficulty', v)}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Segmented
              label={t('create.rounds')}
              value={settings.rounds}
              options={ROOM_LIMITS.rounds.map((r) => ({ value: r, label: String(r) }))}
              onChange={(v) => update('rounds', v)}
            />
            <Segmented
              label={t('create.clip')}
              value={settings.clipSeconds}
              options={ROOM_LIMITS.clipSeconds.map((s) => ({ value: s, label: t('create.seconds', { seconds: s }) }))}
              onChange={(v) => update('clipSeconds', v)}
            />
          </div>
          {createError && <ErrorText>{t(`errors.${createError}`)}</ErrorText>}
          <PrimaryButton type="submit" disabled={busy !== null}>
            {busy === 'create' ? t('create.creating') : t('create.submit')}
          </PrimaryButton>
        </form>
      </RoomCard>
    </div>
  );
}
