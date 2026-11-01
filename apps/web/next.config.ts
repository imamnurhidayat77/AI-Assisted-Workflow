import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@street-smart/shared'],
  outputFileTracingRoot: new URL('../../', import.meta.url).pathname,
};

export default nextConfig;
