/** @type {import('next').NextConfig} */
module.exports = {
  transpilePackages: ["@app/shared", "@app/ui"],
  output: "standalone",
};
