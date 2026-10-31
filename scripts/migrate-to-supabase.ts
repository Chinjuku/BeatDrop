import fs from 'node:fs';
import path from 'node:path';

// Automatically load environment variables from .env.local and .env
for (const envFile of ['.env.local', '.env']) {
  const envPath = path.resolve(process.cwd(), envFile);
  if (fs.existsSync(envPath)) {
    try {
      process.loadEnvFile(envPath);
    } catch {}
  }
}

import { dbService } from '../lib/db.ts';
import { isSupabaseConfigured, supabaseAdmin } from '../lib/supabase.ts';

async function main() {
  process.env.DB_LOCAL = 'false'; // Ensure Supabase calls are enabled for migration
  const hasSupabaseCreds = Boolean(
    process.env.SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)
  );

  if (!hasSupabaseCreds) {
    console.error(
      '❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.\n' +
        'Usage: SUPABASE_URL="https://xxx.supabase.co" SUPABASE_SERVICE_ROLE_KEY="..." npm run migrate:supabase'
    );
    process.exit(1);
  }

  console.log('🚀 Starting BeatDrop SQLite -> Supabase PostgreSQL migration...');

  // 1. Migrate Custom Artists
  const artists = dbService.getCustomArtists();
  console.log(`🎤 Migrating ${artists.length} custom artists...`);
  for (const artist of artists) {
    await supabaseAdmin.upsertArtist(artist);
  }

  // 2. Migrate All Songs in batches of 500
  const songs = dbService.getAllSongs();
  console.log(`🎵 Migrating ${songs.length} songs in batches of 500...`);
  const migratedSongs = await supabaseAdmin.upsertSongs(songs, 500);
  console.log(`✅ Upserted ${migratedSongs}/${songs.length} songs into public.songs`);

  // 3. Migrate Leaderboard Entries
  const leaderboard = dbService.getLeaderboard('all', undefined, 500);
  console.log(`🏆 Migrating ${leaderboard.length} leaderboard entries...`);
  await supabaseAdmin.upsertLeaderboard(leaderboard);

  console.log('🎉 Migration to Supabase PostgreSQL completed successfully!');
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
