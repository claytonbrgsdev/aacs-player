const isProd = process.env.NODE_ENV === 'production'

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  basePath: isProd ? '/aacs-player' : '',
  assetPrefix: isProd ? '/aacs-player/' : '',
  trailingSlash: true,
}

export default nextConfig
