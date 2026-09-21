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
        {/* ?v= IS LOAD-BEARING.
            Chrome keys its favicon store on the ICON URL and holds one for
            days - it will not re-request /api/favicon just because the page
            changed, which is why the tab kept showing the old icon after
            pkg983 with nothing at all in the Network tab. Bump v when the
            icon needs to change for everyone.
            type is explicit because the route 302s to a PNG and a browser
            should not have to guess what it is about to receive. */}
        <link rel="icon" type="image/png" href="/api/favicon?v=2" />
        <link rel="apple-touch-icon" href="/api/favicon?v=2" />
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
