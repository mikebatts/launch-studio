import type { Store } from "./store.ts";
import { generate, buildModelContext } from "./model.ts";
import { iso, proposal } from "./domain.ts";
import type {
  Fields,
  WorkspaceState,
  GenerationRun,
  DocumentId,
  Proposal,
} from "../shared/types.ts";
export function proposeRunResult(
  s: WorkspaceState,
  run: GenerationRun,
  id: DocumentId,
  fields: Fields,
  sourceRefs: Proposal["sourceRefs"],
) {
  const base = run.capturedDocuments[id]!;
  for (const field of Object.keys(fields) as (keyof Fields)[]) {
    if (run.fields && !run.fields.includes(field)) continue;
    if (fields[field] === base.fields[field]) continue;
    proposal(s, s.documents[id], field, fields[field], "live model", base);
    s.proposals.at(-1)!.sourceRefs = sourceRefs;
  }
}
export function startWorker(store: Store) {
  let busy = false;
  const controllers = new Map<string, AbortController>();
  async function runGeneration(workspaceId: string, runId: string) {
    const initial = store.read(workspaceId)!;
    const run = initial.runs.find((r) => r.id === runId)!;
    const attempt = run.attempt;
    const context = buildModelContext(initial);
    const controller = new AbortController();
    controllers.set(runId, controller);
    const valid = () => {
      const r = store.read(workspaceId)?.runs.find((r) => r.id === runId);
      return r && r.attempt === attempt && r.status === "running";
    };
    store.mutate(workspaceId, (s) => {
      const r = s.runs.find((r) => r.id === runId)!;
      r.status = "running";
      r.events.push({
        seq: r.events.length + 1,
        at: iso(),
        type: "sources",
        message: `Prepared ${context.sources.length} confirmed editorial source excerpts and ${context.audienceIntent.length} enabled segment intents for the writer. Structured timing and access remain server-owned.`,
      });
    });
    for (const id of run.targets) {
      if (!valid()) break;
      store.mutate(workspaceId, (s) => {
        const r = s.runs.find((r) => r.id === runId)!;
        r.events.push({
          seq: r.events.length + 1,
          at: iso(),
          type: "drafting",
          documentId: id,
          message: `Requesting ${id} language from local Ollama.`,
        });
      });
      try {
        const d = run.capturedDocuments[id]!;
        const fields = await generate(
          initial,
          d,
          run.instructions,
          AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]),
          run.fields,
        );
        if (run.fields?.every((field) => fields[field] === d.fields[field]))
          throw new Error(
            "The model returned unchanged requested fields, so no revision proposal was created. Try a more specific editorial request; timing and access remain source-controlled.",
          );
        if (!valid()) break;
        store.mutate(workspaceId, (s) => {
          const r = s.runs.find((r) => r.id === runId)!;
          if (s.course.sourceRevision !== r.sourceRevision)
            throw new Error(
              "Source changed during generation. Retry against the current confirmed facts.",
            );
          proposeRunResult(
            s,
            r,
            id,
            fields,
            context.sources.map((source) => ({
              id: source.id,
              revision: source.revision,
            })),
          );
          r.completedTargets.push(id);
          r.events.push({
            seq: r.events.length + 1,
            at: iso(),
            type: "validated",
            documentId: id,
            message:
              "Structured fields and bounded claim checks passed. Proposals await human review; no document was overwritten.",
          });
        });
      } catch (error) {
        if (!valid()) break;
        store.mutate(workspaceId, (s) => {
          const r = s.runs.find((r) => r.id === runId)!;
          r.failedTargets.push(id);
          r.error =
            error instanceof Error ? error.message : "Generation failed";
          r.events.push({
            seq: r.events.length + 1,
            at: iso(),
            type: "error",
            documentId: id,
            message: r.error,
          });
        });
      }
    }
    if (valid())
      store.mutate(workspaceId, (s) => {
        const r = s.runs.find((r) => r.id === runId)!;
        r.status = r.failedTargets.length
          ? r.completedTargets.length
            ? "partial"
            : "failed"
          : "completed";
        r.events.push({
          seq: r.events.length + 1,
          at: iso(),
          type: r.status,
          message: `Run ${r.status}. ${r.completedTargets.length} documents produced reviewable proposals.`,
        });
      });
    controllers.delete(runId);
  }
  // A restarted process resumes unfinished targets, never pretends an interrupted attempt succeeded.
  for (const id of store.workspaces())
    store.mutate(id, (s) => {
      for (const r of s.runs)
        if (r.status === "running") {
          r.status = "queued";
          r.attempt++;
          r.targets = r.targets.filter((t) => !r.completedTargets.includes(t));
          r.events.push({
            seq: r.events.length + 1,
            at: iso(),
            type: "recovered",
            message:
              "Server restarted; unfinished targets requeued with a new attempt fence.",
          });
        }
    });
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      for (const workspaceId of store.workspaces()) {
        const state = store.read(workspaceId)!;
        for (const [id, c] of controllers)
          if (state.runs.some((r) => r.id === id && r.status === "cancelled"))
            c.abort();
        const run = state.runs.find((r) => r.status === "queued");
        if (run && controllers.size < 1 && !controllers.has(run.id))
          void runGeneration(workspaceId, run.id).catch(() =>
            controllers.delete(run.id),
          );
        const claim = store.claim(workspaceId);
        if (claim) {
          const count = store.read(workspaceId)!.candidate!.bindings.length;
          for (let i = 0; i < count; i++) {
            if (!store.commitRecipient(workspaceId, claim, i)) break;
            await new Promise((resolve) => setTimeout(resolve, 15));
          }
          store.finish(workspaceId, claim);
        }
      }
    } finally {
      busy = false;
    }
  }, 350);
  return () => {
    clearInterval(timer);
    for (const c of controllers.values()) c.abort();
  };
}
