import withPWAInit from "next-pwa";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

import defaultCache from "next-pwa/cache.js";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/script\.google\.com\/.*/i,
      handler: "NetworkOnly",
    },
    {
      urlPattern: /^https:\/\/script\.googleusercontent\.com\/.*/i,
      handler: "NetworkOnly",
    },
    ...defaultCache,
  ],
});

export default withPWA(nextConfig);
