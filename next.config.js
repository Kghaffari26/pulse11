const isDev = process.env.NODE_ENV === "development";

/** @type {import("next").NextConfig} */
const config = {
  images: {
    domains: ["vybe.build", "i.ibb.co", "cdn.brandfetch.io"],
  },
  // unpdf bundles a serverless pdfjs build that it loads via `await
  // import('unpdf/pdfjs')`. If webpack inlines unpdf into the route chunk, that
  // dynamic import resolves to a bundled module path that doesn't exist at
  // runtime — same failure mode as pdf-parse 2.x. Mammoth has the same shape:
  // jszip + xml deps that webpack inlines incorrectly. Marking both as server-
  // external keeps them as `require(...)` calls, so NFT traces the real module
  // graph into the deploy.
  serverExternalPackages: ["unpdf", "mammoth"],
  eslint: {
    // Warning: This allows production builds to successfully complete even if
    // your project has ESLint errors.
    ignoreDuringBuilds: true,
  },
  devIndicators: false,
  ...(isDev && {
    experimental: {
      swcPlugins: [["@vybe-adk/swc-dom-source", { attr: "data-source", exclude: ["components/ui"] }]],
    },
  }),
  webpack: (webpackConfig, { dev }) => {
    if (!dev) {
      webpackConfig.cache = Object.freeze({
        type: "filesystem",
        maxMemoryGenerations: 1,
        maxAge: 1000 * 60 * 60 * 24, // one day
      });
    }
    return webpackConfig;
  },
};

export default config;
