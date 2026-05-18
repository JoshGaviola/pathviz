/** @type {import('next').NextConfig} */
const nextConfig = {
  // Export the site as a fully static site (next export)
  output: 'export',
  // If you will host at https://<user>.github.io/pathviz set basePath/assetPrefix
  // Adjust these if your repo name differs (use lowercase to match repo name)
  basePath: '/pathviz',
  assetPrefix: '/pathviz/',
};

module.exports = nextConfig;
