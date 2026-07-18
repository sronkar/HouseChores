/** @type {import('next').NextConfig} */
const nextConfig = {
  // node:sqlite is a native builtin; keep it external to the server bundle.
  serverExternalPackages: ["node:sqlite"],
  // self-contained server bundle for a small Docker image (node server.js)
  output: "standalone",
};

export default nextConfig;
