/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent webpack from bundling pdfkit — it loads font files via __dirname
  // at runtime, which breaks when bundled. This lets Node.js require it natively.
  serverExternalPackages: ['pdfkit'],
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'images.squarespace-cdn.com' },
    ],
  },
  async headers() {
    const adminSecurityHeaders = [
      // Admin pages should never be indexed.
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      // Prevent the admin panel from being framed (clickjacking protection).
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    ];
    // Applies EVERYWHERE, including the ordering site — which is where boats
    // type names, phone numbers and orders, and where a logged-in session
    // lives. Until now only /admin was covered, so the customer-facing side
    // could be framed by anyone and had no MIME-sniffing or referrer policy.
    // (SECURITY_AUDIT.md item 6.)
    const baseSecurityHeaders = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      // SAMEORIGIN, not DENY: the ordering pages are never legitimately framed
      // by a third party, but leaving same-origin framing available avoids
      // breaking anything internal that embeds a preview.
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },

      // ⚠️ HSTS IS DELIBERATELY NOT HERE YET.
      //
      // { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }
      //
      // Browsers cache it for the full year and there is no way to un-ring that
      // bell from the server side — a mistake means a year of a domain that
      // refuses to load over HTTP for everyone who visited once. Vercel already
      // redirects HTTP to HTTPS, so the only gain is the very first request.
      // Uncomment on a deploy someone is actually watching, and consider
      // leaving includeSubDomains off until every subdomain is confirmed
      // HTTPS-only (shop.*, order.*, send.*).
    ];

    return [
      // The negative lookahead keeps the admin paths OUT of this rule. Both
      // lists set X-Frame-Options and they disagree — DENY for admin,
      // SAMEORIGIN elsewhere — and two rules matching one path means relying on
      // which one Next happens to apply last. Not a thing to leave to chance on
      // a clickjacking control.
      { source: '/((?!admin|api/admin).*)', headers: baseSecurityHeaders },
      { source: '/admin/:path*', headers: adminSecurityHeaders },
      { source: '/api/admin/:path*', headers: adminSecurityHeaders },
    ];
  },
};

module.exports = nextConfig;
