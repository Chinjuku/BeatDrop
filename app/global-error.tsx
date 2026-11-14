'use client';

import { useEffect } from 'react';

/**
 * Last-resort boundary for errors in the root layouts. It replaces the whole document, so it
 * cannot rely on providers or translations; the copy is bilingual and the styles are inline.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="th" style={{ backgroundColor: '#030704' }}>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#030704',
          color: '#f3f4f6',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          textAlign: 'center',
          padding: '1rem',
        }}
      >
        <div role="alert" style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 0.5rem' }}>
            เกิดข้อผิดพลาด · <span lang="en">Something went wrong</span>
          </h1>
          <p style={{ fontSize: '0.9rem', color: '#9ca3af', margin: '0 0 1.25rem' }}>
            ลองใหม่อีกครั้ง หรือรีเฟรชหน้า · <span lang="en">Please try again or reload the page.</span>
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: '#22c55e',
              color: '#030704',
              border: 0,
              borderRadius: 999,
              padding: '0.65rem 1.4rem',
              fontWeight: 700,
              cursor: 'pointer',
              marginRight: 8,
            }}
          >
            ลองใหม่ · <span lang="en">Try again</span>
          </button>
          <a href="/play" style={{ color: '#4ade80', fontWeight: 700 }}>
            BeatDrop
          </a>
        </div>
      </body>
    </html>
  );
}
