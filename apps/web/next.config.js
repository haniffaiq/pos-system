const createNextIntlPlugin = require("next-intl/plugin");

const withNextIntl = createNextIntlPlugin("./src/i18n.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@app/shared", "@app/ui"],
  output: "standalone",
};

module.exports = withNextIntl(nextConfig);
