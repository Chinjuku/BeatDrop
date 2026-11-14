/** Colours for other players in a live room, by join order. None are green: green is reserved for "you". */
export const ROOM_PLAYER_COLORS: readonly string[] = [
  '#a78bfa', // violet
  '#fbbf24', // amber
  '#38bdf8', // sky
  '#fb7185', // rose
  '#fb923c', // orange
  '#60a5fa', // blue
  '#f472b6', // pink
  '#c084fc', // purple
  '#f87171', // red
  '#e879f9', // fuchsia
  '#fde68a', // pale yellow
];

export const ROOM_ME_COLOR = 'var(--song-accent)';

export function playerColor(colorIndex: number, isMe: boolean): string {
  if (isMe) return ROOM_ME_COLOR;
  const n = ROOM_PLAYER_COLORS.length;
  return ROOM_PLAYER_COLORS[((colorIndex % n) + n) % n];
}
