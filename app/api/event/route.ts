import { authorized, operate } from "@/lib/server";
import { csvResults } from "@/lib/model";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return handle(request, false);
}
export async function POST(request: Request) {
  return handle(request, true);
}
async function handle(request: Request, post: boolean) {
  try {
    const user = await authorized(request);
    if (
      post &&
      request.headers.get("origin") &&
      request.headers.get("origin") !== new URL(request.url).origin
    )
      return Response.json({ error: "Invalid origin" }, { status: 403 });
    const body = post
      ? await request.json()
      : { id: new URL(request.url).searchParams.get("id") };
    const action = post ? body.action : "state";
    if (!["state", "create", "import", "lock", "draw", "ack"].includes(action))
      throw new Error("Unknown action");
    const event = await operate(user, action, body);
    if (!post && new URL(request.url).searchParams.has("export") && event)
      return new Response(csvResults(event), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="onam-results.csv"',
          "Cache-Control": "no-store",
        },
      });
    return Response.json(
      { event },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    return Response.json(
      {
        error: message.includes("Unauthorized")
          ? "Sign in with an invited organizer account."
          : message,
      },
      { status: message === "Unauthorized" ? 401 : 400 },
    );
  }
}
