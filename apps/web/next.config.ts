import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@mulsigye/contracts", "@mulsigye/llm"]
};

export default nextConfig;
