// Returns the build id of the deployment currently serving the site.
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ id: process.env.NEXT_PUBLIC_BUILD_ID || "dev" }, { headers: { "Cache-Control": "no-store" } });
}
