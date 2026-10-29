/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: "/start_track_generation",
        destination: "/api/start_track_generation",
      },
      {
        source: "/get_generated_track",
        destination: "/api/get_generated_track",
      },
      { source: "/tracks", destination: "/api/tracks" },
      {
        source: "/tracks/:trackId/download",
        destination: "/api/tracks/:trackId/download",
      },
      {
        source: "/tracks/:trackId/file",
        destination: "/api/tracks/:trackId/file",
      },
      {
        source: "/tracks/:trackId",
        destination: "/api/tracks/:trackId",
      },
    ];
  },
};

export default nextConfig;
