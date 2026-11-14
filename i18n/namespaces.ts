/**
 * Every message namespace. Each one is a pair of files: messages/th/<ns>.json and
 * messages/en/<ns>.json. Keep this list, the files, and verify-i18n.ts in sync.
 */
export const MESSAGE_NAMESPACES = [
  'Common',
  'Metadata',
  'Navbar',
  'Shell',
  'Pwa',
  'Consent',
  'Legal',
  'Privacy',
  'Cookies',
  'NotFound',
  'Play',
  'Daily',
  'Guesser',
  'Setup',
  'TimeRange',
  'Audio',
  'Guess',
  'Reveal',
  'Game',
  'Share',
  'Categories',
  'Leaderboard',
  'Artists',
  'Room',
  'Archive',
] as const;

export type MessageNamespace = (typeof MESSAGE_NAMESPACES)[number];
