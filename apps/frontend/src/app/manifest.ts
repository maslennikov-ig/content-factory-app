import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Content Factory',
    short_name: 'Content Factory',
    description:
      'Plan, draft, review and publish content across channels in one workspace.',
    start_url: '/launches',
    display: 'standalone',
    // No theme is available in a manifest, so these are the dark theme's
    // `canvas` and `accent` — dark is the primary theme (ADR-0008), and the
    // icons are drawn against the same canvas.
    background_color: '#14150F',
    theme_color: '#7FB03A',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
    ],
  };
}
