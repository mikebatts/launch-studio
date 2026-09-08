import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "./store.ts";
import { createApp } from "./index.ts";

test("portfolio access is opt-in, not returned by metadata, and respects origin/no-store controls", async () => {
  const dir = mkdtempSync(join(tmpdir(), "launch-portfolio-"));
  const path = join(dir, "access.json");
  const store = new Store(":memory:");
  const server = createApp(store, { portfolioAccessPath: path }).listen(
    0,
    "127.0.0.1",
  );
  await new Promise<void>((r) => server.once("listening", r));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    assert.deepEqual(
      await (await fetch(origin + "/api/portfolio-access")).json(),
      { available: false },
    );
    assert.equal(
      (await fetch(origin + "/api/portfolio-access/reveal", { method: "POST" }))
        .status,
      503,
    );
    writeFileSync(
      path,
      JSON.stringify({ password: "non-secret-test-fixture" }),
      { mode: 0o600 },
    );
    const metadata = await fetch(origin + "/api/portfolio-access");
    assert.equal(metadata.headers.get("cache-control"), "no-store");
    assert.deepEqual(await metadata.json(), { available: true });
    assert.equal(
      (
        await fetch(origin + "/api/portfolio-access/reveal", {
          method: "POST",
          headers: { Origin: "https://unrelated.example" },
        })
      ).status,
      403,
    );
    const reveal = await fetch(origin + "/api/portfolio-access/reveal", {
      method: "POST",
      headers: { Origin: origin },
    });
    assert.equal(reveal.headers.get("cache-control"), "no-store");
    assert.deepEqual(await reveal.json(), {
      password: "non-secret-test-fixture",
    });
    writeFileSync(path, "invalid-json");
    assert.equal(
      (await fetch(origin + "/api/portfolio-access/reveal", { method: "POST" }))
        .status,
      503,
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("public and private deployments do not replace each other’s session cookies", async () => {
  const store = new Store(":memory:");
  const server = createApp(store, {
    cookieName: "launch_public_session",
  }).listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const privateSession = store.session(undefined, {
      mode: "live",
      available: false,
      model: "fixture",
      provider: "Ollama",
      endpoint: "local-test",
    });
    const initial = await fetch(base + "/api/session", {
      headers: { cookie: `launch_session=${privateSession.token}` },
    });
    const publicCookie = initial.headers.get("set-cookie")!.split(";")[0];
    assert(publicCookie.startsWith("launch_public_session="));
    const workspace = (await initial.json()).id;
    assert.notEqual(workspace, privateSession.workspaceId);
    const next = await fetch(base + "/api/session", {
      headers: {
        cookie: `launch_session=${privateSession.token}; ${publicCookie}`,
      },
    });
    assert.equal((await next.json()).id, workspace);
    assert.equal(next.headers.get("set-cookie"), null);
    assert(store.read(privateSession.workspaceId));
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    store.close();
  }
});
