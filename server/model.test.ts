import test from "node:test";
import assert from "node:assert/strict";
import { generate } from "./model.ts";
import { initialState } from "./domain.ts";
const make = (id: string) =>
  initialState(id, Date.now(), {
    mode: "live",
    available: true,
    model: "test",
    provider: "Ollama",
    endpoint: "local-test",
  });

test("headline-only inference scopes schema, retries unchanged copy once, preserves other fields", async (t) => {
  const s = make("model-test");
  const d = s.documents["email-sample"];
  const requests: any[] = [];
  t.mock.method(globalThis, "fetch", async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    return Response.json({
      message: {
        content: JSON.stringify({
          headline:
            requests.length === 1
              ? d.fields.headline
              : "Find the fork before you move",
        }),
      },
    });
  });
  const output = await generate(
    s,
    d,
    "Suggest a different headline",
    new AbortController().signal,
    ["headline"],
  );
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0].format.required, ["headline"]);
  assert.deepEqual(Object.keys(requests[0].format.properties), ["headline"]);
  assert.equal(requests[0].options.num_predict, 160);
  assert.deepEqual(output, {
    ...d.fields,
    headline: "Find the fork before you move",
  });
});

test("unchanged punctuation does not become a fake successful suggestion and retry is bounded", async (t) => {
  const s = make("repeat-test");
  const d = s.documents["email-sample"];
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({
      message: {
        content: JSON.stringify({
          headline: d.fields.headline.toUpperCase() + "!",
        }),
      },
    });
  });
  await assert.rejects(
    generate(s, d, "Suggest", new AbortController().signal, ["headline"]),
    /repeated your current copy twice/,
  );
  assert.equal(calls, 2);
});

test("requested fields enforce actual limits and reject unsupported claims without changing drafts", async (t) => {
  const s = make("validation-test");
  const d = s.documents["email-sample"];
  const before = structuredClone(d.fields);
  for (const headline of [
    "x".repeat(91),
    "Gain 200 rating points",
    "Full course access awaits",
    "",
  ]) {
    t.mock.method(globalThis, "fetch", async () =>
      Response.json({ message: { content: JSON.stringify({ headline }) } }),
    );
    await assert.rejects(
      generate(s, d, "Suggest", new AbortController().signal, ["headline"]),
    );
    assert.deepEqual(d.fields, before);
    t.mock.restoreAll();
  }
});

test("cancelled inference propagates abort instead of retrying", async (t) => {
  const s = make("cancel-test");
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: any, init: any) => {
    calls++;
    init.signal.throwIfAborted();
  });
  await assert.rejects(
    generate(s, s.documents["email-sample"], "Suggest", controller.signal, [
      "headline",
    ]),
    { name: "AbortError" },
  );
  assert.equal(calls, 1);
});
