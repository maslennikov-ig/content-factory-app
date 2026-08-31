'use client';
import NextError from 'next/error';

/**
 * The last page a visitor sees when the app itself fails.
 *
 * It used to import an error-reporting SDK here to send the exception and open
 * that vendor's feedback dialog. The SDK is gone from the tree, along with the
 * third-party endpoint it baked into the bundle every visitor downloads.
 * Collecting errors is still worth doing and comes back on our own
 * infrastructure — content-factory-next-ry5.4 — and this file with it.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
