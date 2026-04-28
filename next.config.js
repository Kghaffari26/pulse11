const isDev = process.env.NODE_ENV === "development";

/** @type {import("next").NextConfig} */
const config = {
  images: {
    domains: ["vybe.build", "i.ibb.co", "cdn.brandfetch.io"],
  },
  // pdf-parse 2.x bundles pdfjs-dist, but pdfjs's worker file isn't reachable
  // by Next's NFT static tracer when the dynamic import is inlined into the
  // route chunk. The result is a 476KB chunk that fails at runtime in
  // serverless because pdf.worker.mjs isn't in the deploy. Keeping these as
  // runtime requires lets NFT trace the real require chain into node_modules
  // and ship the worker + assets. Same logic for mammoth (jszip + xml deps).
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "mammoth"],
  // pdfjs's fake-worker fallback does `import(/*webpackIgnore: true*/ workerSrc)`
  // which NFT cannot trace statically — without this explicit include, the
  // worker file is missing from the deploy and PDF parsing fails at runtime.
  outputFileTracingIncludes: {
    "/api/projects/[id]/chat": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
  },
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
