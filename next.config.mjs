/** @type {import('next').NextConfig} */
const nextConfig = {
  // node:sqlite is a native builtin; keep it external to the server bundle.
  serverExternalPackages: ["node:sqlite"],
};

export default nextConfig;
