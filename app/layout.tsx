import type { ReactNode } from 'react';

// The real root layout (with <html lang>) is app/[locale]/layout.tsx.
// This passthrough exists so app/not-found.tsx can render for non-locale paths.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
