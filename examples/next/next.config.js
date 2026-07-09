import { withPixora } from '@dhananjay_verma9546/pixora-compress';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default withPixora(nextConfig, {
  quality: 80,
  formats: ['webp'],
  silent: false,
});
