import { resolveReference } from "@/lib/papers";
export async function POST(request: Request) {
  try {
    if (+(request.headers.get("content-length") || 0) > 16000) return Response.json({ error: "文献情報が長すぎます。" }, { status: 413 });
    const body: any = await request.json();
    if (typeof body.reference !== "string" || body.reference.length < 5 || body.reference.length > 5000) return Response.json({ error: "文献名またはDOIを入力してください（5〜5000文字）。" }, { status: 400 });
    return Response.json(await resolveReference(body.reference));
  } catch { return Response.json({ error: "検索を完了できませんでした。再試行してください。" }, { status: 502 }); }
}
