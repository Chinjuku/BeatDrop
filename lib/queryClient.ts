import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const QUERY_KEYS = {
  artists: ['artists'] as const,
  leaderboard: (category = 'all', mode = 'standard') => ['leaderboard', category, mode] as const,
  daily: ['daily'] as const,
  songs: ['songs'] as const,
};

export const invalidateArtists = async () => {
  await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.artists });
};

export const invalidateLeaderboard = async () => {
  await queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
};

export const invalidateDaily = async () => {
  await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.daily });
};

export const invalidateSongs = async () => {
  await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.songs });
};

export const invalidateAll = async () => {
  await queryClient.invalidateQueries();
};
