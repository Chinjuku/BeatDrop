import express from 'express';
import cors from 'cors';
import { ensureCatalogLoaded, warmupInitialCatalog } from './engine/songPool';
import {
  handleGetArtists,
  handleAddArtist,
  handleSyncArtist,
  handleDeleteArtist,
} from './engine/artistRoutes';
import {
  handleStartRound,
  handleAutocomplete,
  handleGuess,
  handleSkip,
} from './engine/roundEngine';
import { handleDaily } from './engine/dailyEngine';
import {
  handleGetLeaderboard,
  handlePostLeaderboard,
} from './engine/leaderboard';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors());
app.use(express.json());
app.use((_req, _res, next) => {
  ensureCatalogLoaded();
  next();
});

// 1. Artists Endpoints
app.get('/api/artists', handleGetArtists);
app.post('/api/artists/add', handleAddArtist);
app.post('/api/artists/sync', handleSyncArtist);
app.delete('/api/artists/:id', handleDeleteArtist);

// 2. Round & Songpool Endpoints
app.get('/api/songs', handleStartRound);
app.get('/api/round/start', handleStartRound);
app.post('/api/round/start', handleStartRound);
app.get('/api/songspot/round', handleStartRound);

// 3. Autocomplete Endpoints
app.get('/api/autocomplete', handleAutocomplete);
app.get('/api/songspot/search', handleAutocomplete);

// 4. Guess & Skip Endpoints
app.post('/api/round/guess', handleGuess);
app.post('/api/songspot/guess', handleGuess);
app.post('/api/round/skip', handleSkip);
app.post('/api/songspot/skip', handleSkip);

// 5. Daily Challenge Endpoint
app.get('/api/daily', handleDaily);

// 6. Leaderboard Endpoints
app.get('/api/leaderboard', handleGetLeaderboard);
app.post('/api/leaderboard', handlePostLeaderboard);

// Standalone Server launch (when run directly)
if (process.env.STANDALONE_EXPRESS === '1') {
  warmupInitialCatalog().then(() => {
    app.listen(PORT, () => {
      console.log(`[Server] BeatDrop Backend running at http://localhost:${PORT}`);
    });
  });
}

export { ensureCatalogLoaded };
export default app;
