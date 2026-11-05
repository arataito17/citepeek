export async function GET() {
  try {
    const r = await fetch("https://arxiv.org/pdf/1706.03762", { signal: AbortSignal.timeout(25000) });
    if (!r.ok) throw new Error("demo");
    return new Response(r.body, { headers: { "Content-Type": "application/pdf", "Cache-Control": "public,max-age=86400" } });
  } catch { return Response.json({ error: "サンプルPDFを取得できませんでした。お手元のPDFを選んでください。" }, { status: 502 }); }
}
