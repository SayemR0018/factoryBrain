/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts"]
  },

  // ── Frontend ↔ ASP.NET Core bridge ──────────────────────────────────────────
  // Every /api/* request from the existing src/app/api/** route handlers and
  // every fetch() inside the components is transparently proxied to the .NET
  // backend. NO frontend code change is required.
  //
  // Override the backend URL by setting the BACKEND_URL env var at runtime
  // (default: http://localhost:5000).
  async rewrites() {
    const target = process.env.BACKEND_URL || "http://localhost:5000";
    return [
      {
        source: "/api/:path*",
        destination: `${target}/api/:path*`
      },
      // Health is also exposed via the proxy so smoke tests from the browser
      // get the same CORS-friendly host as the JSON API.
      {
        source: "/health",
        destination: `${target}/health`
      }
    ];
  },
  // `src/services/rag/vector-store.ts` (and friends) lazy-resolves
  // `node:fs` / `node:path` / `node:crypto` only on the server. The RAG
  // index is never instantiated on the client, so the browser bundle
  // shouldn't try to resolve the node: schemes. We tell webpack to leave
  // them as external imports — at runtime the calls happen only on the
  // server where Node.js supplies the modules naturally.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Client bundle: externalize any node: scheme imports so webpack
      // doesn't try to bundle them. They're never invoked client-side.
      const externals = Array.isArray(config.externals) ? config.externals : [config.externals];
      externals.push(({ request }, callback) => {
        if (typeof request === "string" && request.startsWith("node:")) {
          return callback(null, "commonjs " + request);
        }
        callback();
      });
      config.externals = externals;
    }
    return config;
  }
};

export default nextConfig;