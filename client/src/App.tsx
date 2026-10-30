import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GameProvider } from './context/GameContext';
import { RootLayout } from './layouts/RootLayout';
import { PlayPage } from './pages/PlayPage';
import { DailyChallengePage } from './pages/DailyChallengePage';
import { SongGuesserPage } from './pages/SongGuesserPage';
import { MusicQuizzesPage } from './pages/MusicQuizzesPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <GameProvider>
        <Routes>
          <Route path="/" element={<RootLayout />}>
            <Route index element={<PlayPage />} />
            <Route path="play" element={<PlayPage />} />
            <Route path="daily" element={<DailyChallengePage />} />
            <Route path="guesser" element={<SongGuesserPage />} />
            <Route path="quizzes" element={<MusicQuizzesPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </GameProvider>
    </BrowserRouter>
  );
};

export default App;
