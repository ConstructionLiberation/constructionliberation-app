import { Html, Head, Main, NextScript } from 'next/document'

// Global document. The favicon and the manifest are both PER TENANT now -
// see pages/api/favicon.js and pages/api/site-webmanifest.js.
export default function Document() {
  return (
    <Html lang="en">
      <Head>
        {/* PER TENANT. These were four hardcoded Rock files on every page of
            every customer - the tab icon, which is a different mechanism from
            the manifest pkg981 fixed. /api/favicon redirects to the tenant's
            iconUrl, or to /favicon.ico when it has none, so Rock is unchanged. */}
        <link rel="icon" href="/api/favicon" />
        <link rel="apple-touch-icon" href="/api/favicon" />
        {/* Per tenant - see pages/api/site-webmanifest.js. The static file said
            "Rock Roofing" to every customer's phone. */}
        <link rel="manifest" href="/api/site-webmanifest" />
        <meta name="theme-color" content="#1a1a19" />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  )
}
