import test from "node:test";
import assert from "node:assert/strict";
import { proxyRequest } from "../api/proxy.ts";
const url = "https://launch.example/api/proxy?route=";
test("proxy preserves same-origin sessions, JSON and no-store without exposing the backend URL", async () => {
  const handler: typeof fetch = async (input, init) => {
    assert.equal(String(input), "https://backend.example/api/actions");
    assert.equal(
      new Headers(init?.headers).get("origin"),
      "https://backend.example",
    );
    assert.equal(
      new Headers(init?.headers).get("cookie"),
      "test_cookie=non-secret-fixture",
    );
    assert.equal(
      Buffer.from(init?.body as ArrayBuffer).toString(),
      '{"type":"requestReview"}',
    );
    return Response.json(
      { candidate: { status: "needs-review" } },
      {
        headers: {
          "Set-Cookie":
            "public_session=test-fixture; Path=/; HttpOnly; Secure; SameSite=Strict",
        },
      },
    );
  };
  const result = await proxyRequest(
    new Request(url + "actions", {
      method: "POST",
      headers: {
        Origin: "https://launch.example",
        "Content-Type": "application/json",
        cookie: "test_cookie=non-secret-fixture",
      },
      body: '{"type":"requestReview"}',
    }),
    "https://backend.example",
    handler,
  );
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert(result.headers.has("set-cookie"));
  assert.deepEqual(await result.json(), {
    candidate: { status: "needs-review" },
  });
});
test("proxy rejects cross-origin writes and path injection, and reports backend failure honestly", async () => {
  const never: typeof fetch = async () => {
    throw new Error("Must not fetch");
  };
  assert.equal(
    (
      await proxyRequest(
        new Request(url + "actions", {
          method: "POST",
          headers: { Origin: "https://unrelated.example" },
        }),
        "https://backend.example",
        never,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await proxyRequest(
        new Request(url + encodeURIComponent("../admin")),
        "https://backend.example",
        never,
      )
    ).status,
    404,
  );
  assert.equal(
    (await proxyRequest(new Request(url + "state"), undefined, never)).status,
    503,
  );
  assert.equal(
    (
      await proxyRequest(
        new Request(url + "state"),
        "https://backend.example",
        never,
      )
    ).status,
    502,
  );
});
test("proxy preserves multipart source uploads byte-for-byte and limits their size", async () => {
  const data = new FormData();
  data.set("file", new Blob(["Original source text"]), "brief.txt");
  const req = new Request(url + "import", { method: "POST", body: data });
  const bytes = await req.clone().arrayBuffer();
  const handler: typeof fetch = async (_input, init) => {
    assert.deepEqual(init?.body, bytes);
    assert(
      new Headers(init?.headers)
        .get("content-type")
        ?.startsWith("multipart/form-data;"),
    );
    return Response.json({ ok: true });
  };
  assert.equal(
    (await proxyRequest(req, "https://backend.example", handler)).status,
    200,
  );
  assert.equal(
    (
      await proxyRequest(
        new Request(url + "import", {
          method: "POST",
          body: new Uint8Array(2300001),
        }),
        "https://backend.example",
        handler,
      )
    ).status,
    413,
  );
});
