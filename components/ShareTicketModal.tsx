'use client';
import React, { useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Share2,
  X,
} from 'lucide-react';
import { CategoryType, DifficultyLevel, GameMode, GuessHistoryItem, Song } from '../types';
import { BeatDropLogo } from './BeatDropLogo';

export interface ShareTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  song?: Song | null;
  outcome: 'correct' | 'failed';
  guessedAtSeconds: number;
  difficulty?: DifficultyLevel;
  stages: number[];
  history: GuessHistoryItem[];
  streak: number;
  category?: CategoryType;
  mode?: GameMode;
  dateKey?: string;
}

export const ShareTicketModal: React.FC<ShareTicketModalProps> = ({
  isOpen,
  onClose,
  song,
  outcome,
  guessedAtSeconds,
  difficulty = 'medium',
  stages,
  history,
  streak,
  category = 'thai',
  mode = 'standard',
  dateKey,
}) => {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  if (!isOpen) return null;

  const isWon = outcome === 'correct';
  // Determine which stage index succeeded
  const correctStageIdx = isWon
    ? stages.findIndex((s) => s >= guessedAtSeconds)
    : -1;
  const activeIdx = correctStageIdx >= 0 ? correctStageIdx : stages.length - 1;

  // Calculate points (e.g. 1000 - stageIndex * 150)
  const points = isWon
    ? Math.max(100, Math.round(1000 - Math.max(0, activeIdx) * 150))
    : 0;

  const timeDisplay = isWon ? `${guessedAtSeconds}s` : 'FAILED';
  const headlineCopy = isWon
    ? `I got it in ${guessedAtSeconds}s. How little do you need?`
    : 'I couldn’t name this one. How little do you need?';

  // Emoji summary line
  const emojiBoxes = stages.map((_, idx) => {
    if (isWon) {
      if (idx < activeIdx) return '⬛';
      if (idx === activeIdx) return '🟩';
      return '⬜';
    }
    return '⬛';
  });

  const shareText = [
    `Songspot • ${category === 'thai' ? '🇹🇭 เพลงไทย' : '🌍 เพลงสากล'}`,
    `HEAR LESS. KNOW MORE.`,
    isWon ? `🟩 ${guessedAtSeconds}s • ${points} points` : `❌ ${stages[stages.length - 1]}s (Game Over)`,
    emojiBoxes.join(''),
    `https://songspot.co #songspot #beatdrop`,
  ].join('\n');

  const handleCopyResult = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Songspot Music Ticket',
          text: shareText,
          url: window.location.origin,
        });
        return;
      } catch {
        // User cancelled or unsupported
      }
    }
    handleCopyResult();
  };

  const handleSaveImage = () => {
    setDownloading(true);
    try {
      const canvas = document.createElement('canvas');
      const scale = 2; // High-res retina scale
      const width = 480;
      const height = 660;
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.scale(scale, scale);

      // 1. Ticket Paper Background
      ctx.fillStyle = '#f2f1e6';
      ctx.beginPath();
      ctx.roundRect(0, 0, width, height, 18);
      ctx.fill();

      // 2. Top Header Row
      ctx.fillStyle = '#0b150f';
      ctx.font = 'italic 800 18px Poppins, sans-serif';
      ctx.fillText('songspot', 32, 44);

      ctx.fillStyle = '#657060';
      ctx.font = '700 9.5px Poppins, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('MUSIC CHALLENGE', width - 32, 42);
      ctx.textAlign = 'left';

      // Horizontal separator line
      ctx.strokeStyle = '#858e80';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(32, 58);
      ctx.lineTo(width - 32, 58);
      ctx.stroke();

      // 3. Game Title & Big Punchy Headline
      ctx.fillStyle = '#0b150f';
      ctx.font = '800 20px Poppins, sans-serif';
      ctx.fillText('Songspot', 32, 90);

      ctx.font = '900 36px "Barlow Condensed", Poppins, sans-serif';
      ctx.fillText('HEAR LESS.', 32, 132);
      ctx.fillText('KNOW MORE.', 32, 172);

      // 4. Large Result Time & Points
      ctx.fillStyle = isWon ? '#00b965' : '#e63946';
      ctx.font = '900 62px Poppins, sans-serif';
      ctx.fillText(timeDisplay, 32, 244);

      ctx.fillStyle = '#2e382d';
      ctx.font = '700 15px Poppins, sans-serif';
      ctx.fillText(`${points} points`, 34, 274);

      // 5. Progression Stage Circles
      const circleCount = stages.length;
      const startX = 32;
      const availableWidth = width - 64;
      const circleRadius = 19;
      const stepDist = availableWidth / (circleCount - 1 || 1);

      stages.forEach((sec, idx) => {
        const cx = circleCount === 1 ? width / 2 : startX + idx * stepDist;
        const cy = 330;

        let circleColor = '#52594f';
        let markText = '—';
        let textColor = '#f2f1e6';

        if (isWon) {
          if (idx < activeIdx) {
            circleColor = '#52594f';
            markText = '—';
          } else if (idx === activeIdx) {
            circleColor = '#00cc72';
            markText = '✓';
            textColor = '#03150b';
          } else {
            circleColor = '#d9dece';
            markText = '—';
            textColor = '#6c7769';
          }
        } else {
          circleColor = idx === stages.length - 1 ? '#e63946' : '#52594f';
          markText = idx === stages.length - 1 ? '✕' : '—';
          textColor = '#f2f1e6';
        }

        ctx.fillStyle = circleColor;
        ctx.beginPath();
        ctx.arc(cx, cy, circleRadius, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = textColor;
        ctx.font = '800 15px Poppins, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(markText, cx, cy);

        // Seconds label below circle
        ctx.fillStyle = '#3b453a';
        ctx.font = '600 11px Poppins, sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText(`${sec}s`, cx, cy + 26);
      });

      // 6. Perforation Tear Line with Notches
      const perfY = 415;
      const notchRadius = 14;

      // Draw left cutout notch
      ctx.fillStyle = '#0d140f'; // Matches dialog backdrop
      ctx.beginPath();
      ctx.arc(0, perfY, notchRadius, -Math.PI / 2, Math.PI / 2);
      ctx.fill();

      // Draw right cutout notch
      ctx.beginPath();
      ctx.arc(width, perfY, notchRadius, Math.PI / 2, (3 * Math.PI) / 2);
      ctx.fill();

      // Dashed perforation line
      ctx.strokeStyle = '#9ca596';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(22, perfY);
      ctx.lineTo(width - 22, perfY);
      ctx.stroke();
      ctx.setLineDash([]); // Reset dash

      // 7. Lower Stub
      ctx.textAlign = 'left';
      ctx.fillStyle = '#0b150f';
      ctx.font = '800 18px "Barlow Condensed", Poppins, sans-serif';
      ctx.fillText(headlineCopy, 32, 460);

      ctx.fillStyle = '#008349';
      ctx.font = '800 16px Poppins, sans-serif';
      ctx.fillText('songspot.co', 32, 510);

      ctx.fillStyle = '#535d51';
      ctx.font = '600 12px Poppins, sans-serif';
      ctx.fillText('#songspot', 145, 510);

      // Vertical divider in stub
      ctx.strokeStyle = '#858e80';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(width - 110, 445);
      ctx.lineTo(width - 110, 520);
      ctx.stroke();

      ctx.fillStyle = '#495347';
      ctx.font = '600 11px Poppins, sans-serif';
      ctx.fillText('No spoilers', width - 96, 475);

      // 8. Download PNG
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `songspot-music-ticket-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to save ticket image:', err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[92vw] sm:max-w-[460px] md:max-w-[480px] rounded-3xl p-4 sm:p-6 shadow-2xl flex flex-col items-center relative my-auto"
        style={{
          backgroundColor: '#0d140f',
          color: '#f3f7f4',
          border: '1px solid #ffffff16',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Bar */}
        <div className="w-full flex items-center justify-between pb-3.5 border-b border-white/10 mb-4">
          <h2 className="text-sm font-extrabold tracking-wide text-neutral-200">
            Your music ticket
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 transition text-neutral-400 hover:text-white"
            aria-label="Close ticket dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* The Exact Songspot Music Ticket Card */}
        <div className="w-full sst-ticket">
          {/* Top Paper Portion */}
          <div className="sst-paper">
            {/* Brand Header */}
            <div className="sst-brand-row">
              <div className="sst-brand">
                <BeatDropLogo className="w-5 h-5 text-emerald-600" />
                <span>songspot</span>
              </div>
              <span className="sst-kicker">MUSIC CHALLENGE</span>
            </div>

            {/* Game Title & Big Punchy Headlines */}
            <div className="sst-game-title">Songspot</div>
            <div className="sst-headline">
              HEAR LESS.
              <br />
              KNOW MORE.
            </div>

            {/* Big Green Time & Score */}
            <div className="sst-score-row">
              <div className="sst-score">
                <strong style={{ color: isWon ? '#00b965' : '#e63946' }}>
                  {timeDisplay}
                </strong>
              </div>
              <div className="sst-detail">{points} points</div>
            </div>

            {/* Progression Circles (0.1s, 0.5s, 2s, 8s, 15s) */}
            <ul className="sst-stages">
              {stages.map((sec, idx) => {
                let matchType: 'none' | 'match' | 'close' = 'none';
                let mark = '—';
                if (isWon) {
                  if (idx < activeIdx) {
                    matchType = 'none';
                    mark = '—';
                  } else if (idx === activeIdx) {
                    matchType = 'match';
                    mark = '✓';
                  } else {
                    matchType = 'close';
                    mark = '—';
                  }
                } else {
                  mark = idx === stages.length - 1 ? '✕' : '—';
                }

                return (
                  <li key={idx}>
                    <span className="sst-stage-mark" data-match={matchType}>
                      {mark}
                    </span>
                    <span>{sec}s</span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Perforation Line with Side Notches */}
          <div className="sst-perforation">
            <span className="sst-perforation-notch-left" />
            <span className="sst-perforation-line" />
            <span className="sst-perforation-notch-right" />
          </div>

          {/* Bottom Paper Stub */}
          <div className="sst-stub">
            <div className="sst-stub-copy">
              <p>{headlineCopy}</p>
              <div className="sst-signoff">
                <strong>songspot.co</strong>
                <span>#songspot</span>
              </div>
            </div>
            <div className="sst-stub-note">
              <span>No spoilers</span>
            </div>
          </div>
        </div>

        {/* Action Buttons Below Ticket */}
        <div className="sst-actions space-y-2.5">
          {/* Primary Share Button */}
          <button
            type="button"
            onClick={handleShare}
            className="sst-primary"
          >
            <Share2 className="w-5 h-5" />
            <span>Share challenge</span>
          </button>

          {/* Secondary Buttons Row (Copy result & Save image) */}
          <div className="sst-secondary-row">
            <button type="button" onClick={handleCopyResult}>
              <Copy className="w-5 h-5 text-emerald-400" />
              <div>
                <div className="font-bold">
                  {copied ? 'Copied! ✓' : 'Copy result'}
                </div>
                <small>Score + link + #songspot</small>
              </div>
            </button>

            <button
              type="button"
              onClick={handleSaveImage}
              disabled={downloading}
            >
              <Download className="w-5 h-5 text-emerald-400" />
              <div>
                <div className="font-bold">
                  {downloading ? 'Saving...' : 'Save image'}
                </div>
                <small>Ticket PNG</small>
              </div>
            </button>
          </div>
        </div>

        {/* Footnote */}
        <p className="mt-3 text-[11px] font-semibold text-neutral-400 text-center">
          Friends start a fresh round.
        </p>
      </div>
    </div>
  );
};

