/** @type {import('next').NextConfig} */
const nextConfig = {
  // Export the site as a fully static site (next export)
  output: 'export',
  // If you will host at https://<user>.github.io/PathViz set basePath/assetPrefix
  // Adjust these if your repo name differs
  basePath: '/PathViz',
  assetPrefix: '/PathViz/',
};

module.exports = nextConfig;
