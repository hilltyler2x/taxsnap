/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.googleusercontent.com" },
    ],
  },
  env: {
    NEXTAUTH_URL: "https://taxsnap-jet.vercel.app",
  },
}

module.exports = nextConfig