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
import {
  generalLimiter,
  roundLimiter,
  artistDiscoverLimiter,
  artistSyncLimiter,
} from './engine/rateLimiter';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// Phase 1: Lock CORS Origin in Production
const allowedOrigins = [
  process.env.NEXT_PUBLIC_APP_URL,
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  'http://localhost:3000',
  'http://localhost:3001',
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || process.env.NODE_ENV !== 'production') return callback(null, true);
      if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
        return callback(null, true);
      }
      return callback(new Error(`Blocked by CORS: origin ${origin} is not allowed`));
    },
    credentials: true,
  })
);

app.use(express.json());
app.use((_req, _res, next) => {
  ensureCatalogLoaded();
  next();
});

// Phase 1: Admin Secret Guard for sensitive catalog operations
const adminSecretGuard = (req: express.Request, res: express.Response, next: express.NextFunction): void => {
  const configuredAdminKey = process.env.ADMIN_API_KEY;
  if (configuredAdminKey) {
    const providedKey = req.headers['x-admin-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
    if (providedKey !== configuredAdminKey) {
      res.status(403).json({
        code: 403,
        message: 'Forbidden: Valid x-admin-key header is required for administrative operations.',
      });
      return;
    }
  }
  next();
};

// Apply baseline rate limiter across all API routes (60 req/min per IP)
app.use('/api', generalLimiter);

// 1. Artists Endpoints (Discovery limited to 15 req/min, Sync limited to 5 req/min, Guarded by Admin Key)
app.post('/api/admin/verify', (req, res) => {
  const configuredAdminKey = process.env.ADMIN_API_KEY;
  if (!configuredAdminKey) {
    res.status(500).json({ code: -1, message: 'ADMIN_API_KEY is not configured on server' });
    return;
  }
  const providedKey =
    req.body?.adminKey ||
    req.headers['x-admin-key'] ||
    req.headers['authorization']?.replace(/^Bearer\s+/i, '');

  if (providedKey === configuredAdminKey) {
    res.json({ code: 0, message: 'Authenticated' });
  } else {
    res.status(403).json({ code: 403, message: 'รหัสผ่าน Admin Key ไม่ถูกต้อง' });
  }
});

app.get('/api/artists', (req, res, next) => {
  if (req.query.discover === 'true') {
    return artistDiscoverLimiter(req, res, next);
  }
  next();
}, handleGetArtists);
app.post('/api/artists/add', handleAddArtist);
app.post('/api/artists/sync', adminSecretGuard, artistSyncLimiter, handleSyncArtist);
app.delete('/api/artists/:id', adminSecretGuard, handleDeleteArtist);

// 2. Round & Songpool Endpoints (Throttled to 40 req/min per IP)
app.get('/api/songs', roundLimiter, handleStartRound);
app.get('/api/round/start', roundLimiter, handleStartRound);
app.post('/api/round/start', roundLimiter, handleStartRound);
app.get('/api/songspot/round', roundLimiter, handleStartRound);

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
