import './globals.css';

// Rendered only for paths the locale middleware never matched, so it carries its own document.
// The copy is bilingual: Thai is the document language, English parts are tagged lang="en".
export default function GlobalNotFound() {
  return (
    <html lang="th" className="dark">
      <body className="min-h-screen flex flex-col items-center justify-center text-center px-4 gap-4">
        <h1 className="text-xl font-extrabold">
          404 · ไม่พบหน้านี้ / <span lang="en">Page not found</span>
        </h1>
        <a
          href="/play"
          className="px-5 py-2.5 rounded-xl text-sm font-extrabold"
          style={{ backgroundColor: 'var(--song-accent)', color: 'var(--song-accent-on)' }}
        >
          BeatDrop
        </a>
      </body>
    </html>
  );
}
