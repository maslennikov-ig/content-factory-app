// @ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    proxyTimeout: 90_000,
  },
  reactStrictMode: false,
  transpilePackages: ['crypto-hash'],
  // No build plugin wraps this config. The error-reporting one that used to
  // uploaded the frontend's source maps — its sources — to a third party on
  // every build, and cut a release there each time. Three settings existed
  // only to feed it and left with it: the `Document-Policy: js-profiling`
  // header,
  // `productionBrowserSourceMaps`, which published readable sources of the
  // whole frontend to every visitor, and a webpack `devtool` override that
  // also made this config incompatible with Turbopack. When error collection
  // returns on our own infrastructure — content-factory-next-ry5.4 — source
  // map upload stays off and `productionBrowserSourceMaps` does not return.
  async redirects() {
    return [
      {
        source: '/api/uploads/:path*',
        destination:
          process.env.STORAGE_PROVIDER === 'local' ? '/uploads/:path*' : '/404',
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination:
          process.env.STORAGE_PROVIDER === 'local'
            ? '/api/uploads/:path*'
            : '/404',
      },
    ];
  },
};

export default nextConfig;
