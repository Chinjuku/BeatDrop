import path from 'node:path';
import { fileURLToPath } from 'node:url';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pwaBuildVersion =
  process.env.VERCEL_DEPLOYMENT_ID ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  `build-${Date.now().toString(36)}`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_PWA_BUILD_VERSION: pwaBuildVersion,
  },
  reactStrictMode: true,
  outputFileTracingRoot: __dirname,
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async redirects() {
    return [
      {
        source: '/quizzes',
        destination: '/categories',
        permanent: true,
      },
      // Home goes straight to the game. Done here (an HTTP redirect) rather than in a page,
      // where streaming under loading.tsx would turn it into a slow meta-refresh.
      { source: '/', destination: '/play', permanent: false },
      { source: '/en', destination: '/en/play', permanent: false },
      { source: '/en/quizzes', destination: '/en/categories', permanent: true },
    ];
  },
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    return config;
  },
};

export default withNextIntl(nextConfig);
