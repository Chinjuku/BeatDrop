'use client';
import { Link, usePathname, useRouter } from '../i18n/navigation';

import React, { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Navbar } from './Navbar';
import { AddArtistModal } from './AddArtistModal';
import { LeaderboardModal } from './LeaderboardModal';
import { ShareTicketModal } from './ShareTicketModal';
import { PwaManager } from './PwaManager';
import { CookieConsent } from './CookieConsent';
import { CookiePreferencesButton } from './CookiePreferencesButton';
import { BeatDropLogo } from './BeatDropLogo';
import { useGame } from '../context/GameContext';
import { invalidateArtists, invalidateSongs } from '../lib/queryClient';
import type { GameConfig, GameMode } from '../types';

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const t = useTranslations('Shell');
  const router = useRouter();
  const pathname = usePathname() || '/play';
  const navigate = (path: string) => router.push(path);

  const {
    config,
    handleConfigChange,
    handleCategoryChange,
    artists,
    fetchArtists,
    streak,
    bestStreak,
    fastestTime,
    dailyInfo,
    dailyIndex,
    dailyScore,
    addArtistOpen,
    setAddArtistOpen,
    leaderboardOpen,
    setLeaderboardOpen,
    ticketModalOpen,
    setTicketModalOpen,
    revealSong,
    outcome,
    activeClipSeconds,
    stages,
    history,
    loadingRound,
  } = useGame();

  // The launch splash stays up as the loading stage until the shell has mounted and the
  // first round has finished loading, then fades out (capped so it never hangs).
  const [splashDone, setSplashDone] = useState(false);
  useEffect(() => {
    if (splashDone) return;
    const finish = () => setSplashDone(true);
    const cap = window.setTimeout(finish, 6000);
    // Give mount effects a moment to start the first round request before checking it.
    const settle = loadingRound ? undefined : window.setTimeout(finish, 250);
    return () => {
      window.clearTimeout(cap);
      if (settle) window.clearTimeout(settle);
    };
  }, [loadingRound, splashDone]);
  useEffect(() => {
    if (!splashDone) return;
    const splash = document.getElementById('beatdrop-boot-splash');
    if (!splash) return;
    splash.setAttribute('data-hidden', 'true');
    const timer = window.setTimeout(() => splash.remove(), 400);
    return () => window.clearTimeout(timer);
  }, [splashDone]);

  // The install offer waits until the player has finished at least one round this visit.
  const [hasFinishedRound, setHasFinishedRound] = useState(false);
  useEffect(() => {
    if (outcome) setHasFinishedRound(true);
  }, [outcome]);

  const handleToggleDailyMode = () => {
    if (pathname === '/daily') {
      navigate('/play');
    } else {
      navigate('/daily');
    }
  };

  const handleSelectQuiz = (
    mode: GameMode,
    filters?: { artist?: string; year?: string; genre?: string }
  ) => {
    const targetMode: GameMode = mode === 'guesser' || mode === 'daily' ? mode : 'standard';
    const nextCfg: GameConfig = {
      ...config,
      mode: targetMode,
      artistName: filters?.artist,
      yearFilter: filters?.year || 'any',
      genreFilter: filters?.genre || 'any',
    };
    handleConfigChange(nextCfg, true);

    if (mode === 'daily') {
      navigate('/daily');
    } else if (mode === 'guesser') {
      navigate('/guesser');
    } else {
      navigate('/play');
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col relative transition-colors duration-300"
      style={{
        backgroundColor: 'var(--song-page)',
        color: 'var(--song-text)',
      }}
    >
      {/* Extracted Songspot Spotlight SVG Stage Cone */}
      <svg
        className="songspot-spotlight"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polygon
          className="songspot-cone"
          points="292,0 708,0 836,1000 164,1000"
        />
        <line x1="292" y1="0" x2="164" y2="1000" />
        <line x1="708" y1="0" x2="836" y2="1000" />
      </svg>

      {/* Top Navbar */}
      <Navbar
        category={config.category}
        onCategoryChange={handleCategoryChange}
        streak={streak}
        bestStreak={bestStreak}
        fastestTime={fastestTime}
        onOpenAddArtist={() => setAddArtistOpen(true)}
        artistCount={artists.length}
        isDailyMode={pathname === '/daily' || config.mode === 'daily'}
        onToggleDailyMode={handleToggleDailyMode}
        onOpenLeaderboard={() => setLeaderboardOpen(true)}
        onHomeClick={() => navigate('/play')}
        currentMode={config.mode}
        onSelectQuiz={handleSelectQuiz}
      />
      <PwaManager canOfferInstall={hasFinishedRound} />
      <CookieConsent />

      {/* Page Content */}
      <main
        id="beatdrop-main"
        className={`flex-1 w-full mx-auto px-3 py-4 sm:px-6 sm:py-8 flex flex-col relative z-10 ${
          pathname.startsWith('/admin')
            ? 'max-w-[1600px]'
            : pathname.startsWith('/categories')
            ? 'max-w-4xl items-center justify-start'
            : 'max-w-3xl items-center justify-center'
        }`}
      >
        {children}
      </main>

      {/* Songspot-style Minimal Ambient Footer */}
      <footer
        className={`w-full mx-auto py-5 px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] mt-auto text-center border-t border-white/5 relative z-10 ${
          pathname.startsWith('/admin') ? 'max-w-[1600px]' : 'max-w-4xl'
        }`}
      >
        <div
          className="flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs font-semibold"
          style={{ color: 'var(--song-muted)' }}
        >
          <div className="flex items-center gap-2">
            <BeatDropLogo className="w-4 h-4 text-emerald-500" />
            <span className="font-extrabold italic tracking-wider text-neutral-300">BeatDrop</span>
            <span className="opacity-30">•</span>
            <span className="font-bold tracking-widest text-[11px] uppercase opacity-75">
              HEAR LESS. KNOW MORE.
            </span>
          </div>
          <nav
            aria-label={t('footerNav')}
            className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[11px]"
          >
            <span className="opacity-60">🇹🇭 {t('footerTagline')}</span>
            <span aria-hidden="true" className="opacity-25">
              •
            </span>
            <Link href="/privacy" className="opacity-75 underline-offset-2 transition hover:underline hover:opacity-100">
              {t('privacyLink')}
            </Link>
            <Link href="/cookies" className="opacity-75 underline-offset-2 transition hover:underline hover:opacity-100">
              {t('cookiesLink')}
            </Link>
            <CookiePreferencesButton variant="link" className="opacity-75 hover:opacity-100" />
          </nav>
        </div>
      </footer>

      {/* Shared Modals */}
      <AddArtistModal
        isOpen={addArtistOpen}
        onClose={() => setAddArtistOpen(false)}
        artists={artists}
        onArtistAdded={() => {
          fetchArtists();
        }}
        onArtistRemoved={async (id) => {
          try {
            const headers: Record<string, string> = {};
            if (typeof window !== 'undefined') {
              const adminKey = sessionStorage.getItem('beatdrop_admin_key');
              if (adminKey) headers['x-admin-key'] = adminKey;
            }
            await fetch(`/api/artists/${id}`, { method: 'DELETE', headers });
            await invalidateArtists();
            await invalidateSongs();
          } catch {}
          fetchArtists();
        }}
        onPlayArtist={(artist) => {
          handleSelectQuiz('standard', { artist: artist.name });
        }}
      />

      <LeaderboardModal
        isOpen={leaderboardOpen}
        onClose={() => setLeaderboardOpen(false)}
        category={config.category}
        currentStreak={streak}
        bestStreak={bestStreak}
        fastestTime={fastestTime}
        currentDifficulty={config.difficulty}
        dailyScore={pathname === '/daily' || config.mode === 'daily' ? dailyScore : null}
        isDailyMode={pathname === '/daily' || config.mode === 'daily'}
        dateKey={dailyInfo?.dateKey}
        dailyRoundsPlayed={dailyInfo ? Math.min(dailyIndex, dailyInfo.rounds.length) : 0}
        dailyRoundsTotal={dailyInfo?.rounds.length ?? 0}
      />

      <ShareTicketModal
        isOpen={ticketModalOpen}
        onClose={() => setTicketModalOpen(false)}
        song={revealSong}
        outcome={outcome || 'correct'}
        guessedAtSeconds={activeClipSeconds}
        difficulty={config.difficulty}
        stages={stages}
        history={history}
        streak={streak}
        category={config.category}
        mode={config.mode}
        dateKey={dailyInfo?.dateKey}
      />
    </div>
  );
};

