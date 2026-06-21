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
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
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
    return [
      { source: '/admin/:path*', headers: adminSecurityHeaders },
      { source: '/api/admin/:path*', headers: adminSecurityHeaders },
    ];
  },
};

module.exports = nextConfig;
