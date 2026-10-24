import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 모든 화면이 로그인한 사람마다 달라서 캐시 기능(cacheComponents)은 끈다.
  // 페이지는 요청마다 새로 그려진다.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
