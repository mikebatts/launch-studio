import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareMerge,
  restoreDraftCache,
  type LocalDraft,
} from "./draft-state";
const base = {
  subject: "Subject",
  headline: "Original headline",
  body: "Original body",
  dateLine: "Available September 21",
  cta: "Explore course",
};
test("three-way recovery preserves local headline and separately saved remote body/date", () => {
  const draft: LocalDraft = {
    baseRevision: 1,
    baseFields: base,
    fields: { ...base, headline: "Make your next move count." },
  };
  const merged = prepareMerge(draft, {
    ...base,
    body: "A reviewer clarified the lesson.",
    dateLine: "Available September 28",
  });
  assert.equal(merged.headline, "Make your next move count.");
  assert.equal(merged.body, "A reviewer clarified the lesson.");
  assert.equal(merged.dateLine, "Available September 28");
});
test("a same-field collision is kept for explicit review rather than silently discarded", () => {
  const draft: LocalDraft = {
    baseRevision: 4,
    baseFields: base,
    fields: { ...base, dateLine: "My edited September 21 sentence" },
  };
  const current = { ...base, dateLine: "Available September 28" };
  assert.equal(
    prepareMerge(draft, current).dateLine,
    "My edited September 21 sentence",
  );
  assert.equal(current.dateLine, "Available September 28");
  assert.equal(draft.baseRevision, 4);
});
test("recovery restores the captured revision and ignores corrupt or unrelated cache entries", () => {
  const valid: LocalDraft = {
    baseRevision: 2,
    baseFields: base,
    fields: { ...base, headline: "Recovered" },
  };
  const restored = restoreDraftCache(
    JSON.stringify({
      version: 1,
      drafts: {
        "email-included": valid,
        "email-sample": { fields: "broken" },
        "unknown-document": valid,
      },
    }),
  );
  assert.deepEqual(Object.keys(restored), ["email-included"]);
  assert.equal(restored["email-included"]?.baseRevision, 2);
  assert.equal(restored["email-included"]?.fields.headline, "Recovered");
  assert.deepEqual(restoreDraftCache("{broken"), {});
  assert.deepEqual(restoreDraftCache('{"version":2,"drafts":{}}'), {});
});
