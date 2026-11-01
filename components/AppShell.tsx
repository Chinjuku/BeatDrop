'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Navbar } from './Navbar';
import { AddArtistModal } from './AddArtistModal';
import { LeaderboardModal } from './LeaderboardModal';
import { ShareTicketModal } from './ShareTicketModal';
import { BeatDropLogo } from './BeatDropLogo';
import { useGame } from '../context/GameContext';
import { invalidateArtists, invalidateSongs } from '../lib/queryClient';
import type { GameConfig, GameMode } from '../types';

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
  } = useGame();

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

      {/* Page Content */}
      <main
        className={`flex-1 w-full mx-auto px-3 py-4 sm:px-6 sm:py-8 flex flex-col relative z-10 ${
          pathname.startsWith('/admin') ? 'max-w-[1600px]' : 'max-w-3xl items-center justify-center'
        }`}
      >
        {children}
      </main>

      {/* Songspot-style Minimal Ambient Footer */}
      <footer
        className={`w-full mx-auto py-5 px-4 mt-auto text-center border-t border-white/5 relative z-10 ${
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
          <div className="flex items-center gap-3 text-[11px] opacity-60">
            <span>🇹🇭 Thai & International Music Challenge</span>
          </div>
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

