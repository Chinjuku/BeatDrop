export function isAllowedAppleAudioUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'audio-ssl.itunes.apple.com' ||
      host.endsWith('.itunes.apple.com') ||
      (host.endsWith('.apple.com') && host.includes('audio'))
    );
  } catch {
    return false;
  }
}

