/** Vercel serves the UI; durable jobs and SQLite stay in the backend. */
export async function proxyRequest(
  request: Request,
  backendOrigin = process.env.LAUNCH_BACKEND_ORIGIN,
  send: typeof fetch = fetch,
): Promise<Response> {
  const noStore = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const fail = (status: number, error: string) =>
    Response.json({ error }, { status, headers: noStore });
  const url = new URL(request.url);
  const route = url.searchParams.get("route") ?? url.pathname.replace(/^\/api\//, "");
  const simple =
    /^(?:health|session|state|actions|reviewer-invite|reviewer-accept|import|portfolio-access(?:\/reveal)?)$/;
  const versioned =
    /^(?:releases\/[A-Za-z0-9_-]+|documents\/[A-Za-z0-9_-]+\/revisions|runs\/[A-Za-z0-9_-]+\/events)$/;
  if (!simple.test(route) && !versioned.test(route))
    return fail(404, "Unknown API route.");
  if (!["GET", "POST"].includes(request.method))
    return fail(405, "Method not supported.");
  const incomingOrigin = request.headers.get("origin");
  if (incomingOrigin && incomingOrigin !== url.origin)
    return fail(403, "Cross-origin request is not allowed.");
  let backend: URL;
  try {
    backend = new URL(backendOrigin ?? "");
    if (
      backend.protocol !== "https:" ||
      backend.username ||
      backend.password ||
      backend.pathname !== "/" ||
      backend.search ||
      backend.hash
    )
      throw new Error();
  } catch {
    return fail(503, "The demo backend has not been configured.");
  }
  const target = new URL("/api/" + route, backend);
  for (const [key, value] of url.searchParams)
    if (key !== "route") target.searchParams.append(key, value);
  const headers = new Headers({
    Origin: backend.origin,
    Accept: "application/json",
  });
  for (const name of ["cookie", "content-type"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  let body: ArrayBuffer | undefined;
  try {
    if (request.method === "POST") {
      if (Number(request.headers.get("content-length") ?? "0") > 2300000)
        return fail(413, "Source upload is too large.");
      body = await request.arrayBuffer();
      if (body.byteLength > 2300000)
        return fail(413, "Source upload is too large.");
    }
    const upstream = await send(target, {
      method: request.method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(12000)]),
    });
    if (upstream.status >= 300 && upstream.status < 400)
      return fail(502, "Unexpected backend response.");
    const responseHeaders = new Headers(noStore);
    responseHeaders.set(
      "Content-Type",
      upstream.headers.get("content-type") ?? "application/json",
    );
    for (const value of upstream.headers.getSetCookie())
      responseHeaders.append("Set-Cookie", value);
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return fail(
      502,
      "The demo backend is temporarily unavailable. Please try again.",
    );
  }
}
export default { fetch: (request: Request) => proxyRequest(request) };
