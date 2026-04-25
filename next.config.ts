import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-installer uses dynamic require() to pick a platform-specific
  // binary at runtime; it must not be bundled. @resvg/resvg-js ships native
  // .node binaries that the bundler also can't trace correctly.
  serverExternalPackages: [
    "@ffmpeg-installer/ffmpeg",
    "@ffmpeg-installer/darwin-arm64",
    "@ffmpeg-installer/darwin-x64",
    "@ffmpeg-installer/linux-arm64",
    "@ffmpeg-installer/linux-x64",
    "@ffmpeg-installer/win32-x64",
    "@resvg/resvg-js",
  ],
};

export default nextConfig;
