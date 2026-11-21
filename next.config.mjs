/** @type {import('next').NextConfig} */
// Every deployment gets its own build id, so open tabs can notice a newer version.
const buildId = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || String(Date.now());
const nextConfig = { reactStrictMode: false, env: { NEXT_PUBLIC_BUILD_ID: buildId } };
export default nextConfig;
