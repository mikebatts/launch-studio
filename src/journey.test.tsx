import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { initialState, applyAction } from "../server/domain.ts";
import { Store } from "../server/store.ts";
import { proposeRunResult } from "../server/worker.ts";
import type { Action } from "../shared/types.ts";

test("guided launch preserves edits through source review, exact approval, persisted delivery and course return", async () => {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', {
    url: "https://launch-studio.test/",
    pretendToBeVisual: true,
  });
  const win = dom.window;
  const globals = globalThis as unknown as Record<string, unknown>;
  const previous = new Map<string, PropertyDescriptor | undefined>();
  const replace = (key: string, value: unknown) => {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      value,
      configurable: true,
      writable: true,
    });
  };
  for (const key of [
    "window",
    "document",
    "Element",
    "HTMLElement",
    "HTMLInputElement",
    "HTMLTextAreaElement",
    "HTMLDialogElement",
    "Event",
    "MouseEvent",
    "localStorage",
    "sessionStorage",
    "navigator",
  ])
    replace(
      key,
      key === "window" ? win : (win as unknown as Record<string, unknown>)[key],
    );
  replace("requestAnimationFrame", win.requestAnimationFrame.bind(win));
  replace("cancelAnimationFrame", win.cancelAnimationFrame.bind(win));
  replace("IS_REACT_ACT_ENVIRONMENT", true);
  replace(
    "EventSource",
    class {
      onmessage: unknown;
      close() {}
    },
  );
  win.scrollTo = () => {};
  win.HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  win.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const errors: unknown[] = [];
  win.addEventListener("error", (e) => errors.push(e.error));
  const store = new Store(":memory:");
  const initial = initialState("journey-test", Date.now(), {
    mode: "live",
    available: true,
    model: "fixture",
    provider: "Ollama",
    endpoint: "local-test",
  });
  store.save(initial);
  const actions: Action[] = [];
  let rejectNextSave = false;
  replace("fetch", async (url: string, init?: RequestInit) => {
    const s = store.read(initial.id)!;
    if (url.startsWith("/api/releases/"))
      return new Response(JSON.stringify(s.candidate));
    if (url === "/api/actions") {
      const action = JSON.parse(init!.body as string) as Action;
      if (action.type === "editDocument" && rejectNextSave) {
        rejectNextSave = false;
        return new Response(
          JSON.stringify({
            error: "Test save failure; your edits are still here.",
          }),
          { status: 409 },
        );
      }
      actions.push(action);
      try {
        applyAction(s, action);
        store.save(s);
        if (action.type === "enqueue") store.enqueue(s);
      } catch (error) {
        return new Response(
          JSON.stringify({ error: (error as Error).message }),
          { status: 409 },
        );
      }
    } else
      assert(
        ["/api/session", "/api/state"].includes(url),
        `Unexpected request: ${url}`,
      );
    return new Response(JSON.stringify(store.read(initial.id)));
  });
  const { act, createElement } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { default: App } = await import("./App");
  const root = createRoot(document.getElementById("root")!);
  const tick = () => new Promise((r) => setTimeout(r, 25));
  const q = (selector: string) => {
    const el = document.querySelector(selector);
    assert(el, selector);
    return el as HTMLElement;
  };
  const button = (name: string, scope: ParentNode = document) => {
    const el = Array.from(scope.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === name,
    );
    assert(el, `Button: ${name}`);
    return el;
  };
  const click = async (el: HTMLElement) =>
    act(async () => {
      el.click();
      await tick();
    });
  const setText = async (selector: string, value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(
        win.HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(q(selector), value);
      q(selector).dispatchEvent(new win.Event("input", { bubbles: true }));
      await tick();
    });
  try {
    await act(async () => {
      root.render(createElement(App));
      await tick();
    });
    assert(q("h1").textContent?.includes("From course brief"));
    assert(
      !document.querySelector(".rail"),
      "The workspace must not be the initial journey",
    );
    await click(button("Start this launch"));
    assert.equal(
      document.activeElement,
      q("h1"),
      "Stage heading receives focus",
    );
    await setText("#journey-headline", "A headline I wrote myself");
    rejectNextSave = true;
    await click(button("Save & check the learners"));
    assert(
      document.querySelector("#journey-headline"),
      "A failed save must not advance the journey",
    );
    assert.equal(
      (q("#journey-headline") as HTMLTextAreaElement).value,
      "A headline I wrote myself",
    );
    await click(button("Save & check the learners"));
    assert.equal(
      store.read(initial.id)!.documents["email-sample"].fields.headline,
      "A headline I wrote myself",
    );
    assert.notEqual(
      store.read(initial.id)!.documents["email-included"].fields.headline,
      "A headline I wrote myself",
    );
    // Return to editing and exercise proposal semantics without invoking a model.
    await click(button("Back"));
    await click(button("Suggest a headline"));
    const generation = actions.find((a) => a.type === "startGeneration");
    assert(generation && generation.type === "startGeneration");
    assert.deepEqual(generation.targets, ["email-sample"]);
    assert.deepEqual(generation.fields, ["headline"]);
    assert(button("Drafting a headline…").disabled);
    store.mutate(initial.id, (s) => {
      const run = s.runs.at(-1)!;
      proposeRunResult(
        s,
        run,
        "email-sample",
        {
          ...s.documents["email-sample"].fields,
          headline: "A model proposal for review",
        },
        [],
      );
      run.status = "completed";
      s.revision++;
    });
    await act(async () => {
      win.dispatchEvent(new win.Event("focus"));
      await tick();
    });
    assert(
      q(".journey-proposal").textContent?.includes(
        "A model proposal for review",
      ),
    );
    assert.equal(
      store.read(initial.id)!.documents["email-sample"].fields.headline,
      "A headline I wrote myself",
      "AI result must not replace the operator's copy",
    );
    await click(button("Keep current copy"));
    assert(!document.querySelector(".journey-proposal"));
    await click(button("Suggest a headline"));
    await click(button("Stop drafting"));
    assert.equal(store.read(initial.id)!.runs.at(-1)!.status, "cancelled");
    assert(q(".journey-run").textContent?.includes("Your copy is unchanged"));
    await click(button("Suggest a headline"));
    store.mutate(initial.id, (s) => {
      const run = s.runs.at(-1)!;
      run.status = "failed";
      run.error =
        "The writer repeated your current copy twice. Nothing was changed.";
      s.revision++;
    });
    await act(async () => {
      win.dispatchEvent(new win.Event("focus"));
      await tick();
    });
    assert(q(".journey-ai-error").textContent?.includes("Nothing was changed"));
    assert(
      !button("Suggest a headline").disabled,
      "Failure can be retried in place",
    );
    await click(button("Suggest a headline"));
    assert(
      !document.querySelector(".journey-ai-error"),
      "Old failure clears for a new run",
    );
    await click(button("Stop drafting"));
    await click(button("Check the learners"));
    const before = actions.length;
    await click(q(".journey-player-list button:nth-child(3)"));
    assert(
      q(".journey-no-message").textContent?.includes("No invitation for Casey"),
    );
    await click(q(".journey-player-list button:nth-child(2)"));
    assert(q(".journey-preview-label").textContent?.includes("ALEX"));
    assert.equal(
      actions.length,
      before,
      "Previewing does not change audience rules",
    );
    await click(button("Review a change"));
    await act(async () => {
      button("Review date change").click();
      button("Review date change").click();
      await tick();
    });
    assert.equal(
      actions.filter((a) => a.type === "reviseSource").length,
      1,
      "Rapid taps issue one source revision",
    );
    assert.equal(
      store.read(initial.id)!.proposals.filter((p) => p.status === "pending")
        .length,
      4,
    );
    assert((button("Review the launch") as HTMLButtonElement).disabled);
    await click(button("Apply date corrections"));
    assert.equal(
      store.read(initial.id)!.proposals.filter((p) => p.status === "pending")
        .length,
      0,
    );
    assert.equal(
      store.read(initial.id)!.documents["email-sample"].fields.headline,
      "A headline I wrote myself",
    );
    await click(button("Review the launch"));
    await click(button("Prepare this version"));
    assert.equal(store.read(initial.id)!.candidate?.status, "needs-review");
    assert(
      !Array.from(document.querySelectorAll("button")).some(
        (b) => b.textContent === "Approve this version",
      ),
    );
    await click(button("Begin message review"));
    assert.equal(store.read(initial.id)!.role, "reviewer");
    assert(
      button("Approve this version").disabled,
      "All messages must be reviewed first",
    );
    await click(button("Mark reviewed"));
    assert(q(".review-count").textContent?.includes("1 / 4 reviewed"));
    await click(button("Full workspace"));
    assert(document.querySelector(".rail"));
    await click(button("Guided launch"));
    assert(q(".review-count").textContent?.includes("1 / 4 reviewed"));
    const unchecked = Array.from(
      document.querySelectorAll<HTMLButtonElement>(".review-queue-item"),
    ).find((el) => el.textContent?.includes("To review"));
    assert(unchecked);
    await click(unchecked);
    for (let i = 0; i < 3; i++) await click(button("Mark reviewed"));
    assert(q(".review-count").textContent?.includes("4 / 4 reviewed"));
    assert(!button("Approve this version").disabled);
    await click(button("Approve this version"));
    assert.equal(store.read(initial.id)!.candidate?.status, "approved");
    assert.equal(
      document.querySelectorAll(".review-item-status.is-done").length,
      4,
    );
    await click(button("Send approved launch"));
    assert.equal(store.read(initial.id)!.candidate?.status, "queued");
    // Run the real persistence boundary synchronously; no external sending or mocked receipts.
    const claim = store.claim(initial.id);
    assert(claim);
    const count = store.read(initial.id)!.candidate!.bindings.length;
    for (let i = 0; i < count; i++)
      assert(store.commitRecipient(initial.id, claim, i));
    store.finish(initial.id, claim);
    await act(async () => {
      win.dispatchEvent(new win.Event("focus"));
      await tick();
    });
    assert.equal(store.read(initial.id)!.candidate?.status, "delivered");
    await click(button("Open Sam’s email"));
    const frozen = store
      .read(initial.id)!
      .receipts.find((r) => r.playerId === "sam" && r.channel === "email")!;
    assert.equal(frozen.fields.headline, "A headline I wrote myself");
    assert(
      q(".journey-delivered .message-copy h2").textContent?.includes(
        frozen.fields.headline,
      ),
    );
    await click(q(".journey-delivered .course-cta"));
    await click(button("Play the free sample"));
    await click(button("Back to the message"));
    assert(
      q(".journey-delivered .message-copy h2").textContent?.includes(
        frozen.fields.headline,
      ),
      "Returning from the course keeps the opened receipt",
    );
    assert(!q(".launch-journey").closest("[hidden]"));
    await click(button("Full workspace"));
    assert(document.querySelector(".rail"));
    await click(button("Guided launch"));
    assert(
      q("h1").textContent?.includes("The invitation arrived"),
      "Journey position survives full-workspace inspection",
    );
    await click(q('button[aria-label="Launch Studio start"]'));
    await click(button("Continue this launch"));
    await setText("#journey-headline", "A revised invitation after delivery");
    await click(button("Save & check the learners"));
    await click(button("Review a change"));
    await click(button("Review the launch"));
    assert(
      q("h1").textContent?.includes("Review it"),
      "A new edit must not masquerade as the old delivered release",
    );
    assert(
      q(".journey-review .message-copy h2").textContent?.includes(
        "A revised invitation after delivery",
      ),
    );
    await click(button("Prepare this version"));
    assert.notEqual(store.read(initial.id)!.candidate!.id, frozen.releaseId);
    assert.equal(
      store.read(initial.id)!.receipts.find((r) => r.id === frozen.id)!.fields
        .headline,
      frozen.fields.headline,
    );
    assert.deepEqual(errors, [], "No uncaught UI exceptions");
  } finally {
    await act(async () => root.unmount());
    store.close();
    dom.window.close();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globals[key];
    }
  }
});
