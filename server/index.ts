import express from "express";
import multer from "multer";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { Store, type Session } from "./store.ts";
import { applyAction, DomainError, initialState, iso, uid } from "./domain.ts";
import { checkModel, modelStatus } from "./model.ts";
import { startWorker } from "./worker.ts";
import type { Action, WorkspaceState } from "../shared/types.ts";
const documentId = z.enum([
  "email-included",
  "email-sample",
  "inapp-included",
  "inapp-sample",
]);
const field = z.enum(["subject", "headline", "body", "dateLine", "cta"]);
const revision = z.number().int().positive();
const command = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("editDocument"),
      documentId,
      expectedRevision: revision,
      fields: z
        .object({
          subject: z.string().max(8000).optional(),
          headline: z.string().max(8000).optional(),
          body: z.string().max(8000).optional(),
          dateLine: z.string().max(8000).optional(),
          cta: z.string().max(8000).optional(),
        })
        .strict()
        .optional(),
      template: z.enum(["editorial", "compact"]).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("updateRule"),
      ruleId: z.string(),
      expectedRevision: revision,
      patch: z
        .object({
          name: z.string().max(100).optional(),
          enabled: z.boolean().optional(),
          minRating: z.number().min(0).max(4000).optional(),
          maxRating: z.number().min(0).max(4000).optional(),
          interest: z.string().max(50).optional(),
          memberships: z
            .array(z.enum(["Basic", "Gold", "Diamond"]))
            .max(3)
            .optional(),
          locale: z.string().max(10).optional(),
          excludeOwners: z.boolean().optional(),
          maxRatingAgeDays: z.number().min(1).max(365).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("reviseSource"),
      expectedRevision: revision,
      availability: z.string().max(100).optional(),
      text: z.string().max(30000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("confirmSource"),
      sourceId: z.string(),
      availability: z.string().max(100).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("applyProposal"),
      proposalId: z.string(),
      expectedRevision: revision,
      resolution: z.enum(["use-proposal", "keep-current"]).optional(),
      mergedValue: z.string().max(8000).optional(),
    })
    .strict(),
  z
    .object({ type: z.literal("rejectProposal"), proposalId: z.string() })
    .strict(),
  z
    .object({
      type: z.literal("startGeneration"),
      targets: z.array(documentId).min(1).max(4).optional(),
      fields: z.array(field).min(1).max(5).optional(),
      instructions: z.string().max(2000).optional(),
    })
    .strict(),
  z.object({ type: z.literal("cancelGeneration"), runId: z.string() }).strict(),
  z.object({ type: z.literal("retryGeneration"), runId: z.string() }).strict(),
  z
    .object({
      type: z.literal("addComment"),
      documentId,
      field,
      text: z.string().max(2000),
      parentId: z.string().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("resolveComment"),
      commentId: z.string(),
      resolved: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("requestReview"),
      reason: z.string().max(2000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("requestChanges"),
      reason: z.string().max(2000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("switchRole"),
      role: z.enum(["operator", "reviewer"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("prepareCandidate"),
      mode: z.enum(["immediate", "scheduled"]),
      at: z.string().max(100).optional(),
      timeZone: z.string().max(100).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("reviewDocument"),
      candidateId: z.string(),
      expectedRevision: revision,
      documentId,
    })
    .strict(),
  z
    .object({
      type: z.literal("approveCandidate"),
      candidateId: z.string(),
      expectedRevision: revision,
    })
    .strict(),
  z
    .object({
      type: z.literal("enqueue"),
      candidateId: z.string(),
      expectedRevision: revision,
    })
    .strict(),
  z
    .object({ type: z.literal("cancelSchedule"), candidateId: z.string() })
    .strict(),
  z
    .object({
      type: z.literal("trackEvent"),
      eventType: z.enum([
        "message_written",
        "inbox_opened",
        "cta_followed",
        "sample_started",
        "sample_completed",
      ]),
      receiptId: z.string().optional(),
      playerId: z.string(),
    })
    .strict(),
  z.object({ type: z.literal("reset") }).strict(),
]);
export function createApp(
  store: Store,
  options: {
    allowedOrigins?: string[];
    portfolioAccessPath?: string;
    cookieName?: string;
    trustLocalProxy?: boolean;
  } = {},
) {
  // Vite forwards browser Origin unchanged but may rewrite Host to the API.
  // Production proxy origins are an explicit deployment setting, never inferred
  // from untrusted forwarded headers or broadly allowed by hostname suffix.
  const configured = options.allowedOrigins ?? [
    ...(process.env.NODE_ENV === "production"
      ? []
      : ["http://127.0.0.1:5173", "http://localhost:5173"]),
    ...(process.env.LAUNCH_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  ];
  const allowedOrigins = new Set(
    configured.map((origin) => {
      const url = new URL(origin);
      if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin)
        throw new Error(
          "LAUNCH_ALLOWED_ORIGINS must contain exact HTTP(S) origins without paths or credentials.",
        );
      return origin;
    }),
  );
  const app = express();
  app.disable("x-powered-by");
  if (
    options.trustLocalProxy ??
    process.env.LAUNCH_TRUST_LOCAL_PROXY === "true"
  )
    app.set("trust proxy", "loopback");
  const cookieName =
    options.cookieName ?? process.env.LAUNCH_SESSION_COOKIE ?? "launch_session";
  if (!/^[A-Za-z0-9_-]+$/.test(cookieName))
    throw new Error("Invalid session cookie name");
  app.use(express.json({ limit: "100kb" }));
  const rates = new Map<
    string,
    { start: number; count: number; generation: number }
  >();
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const origin = req.get("origin");
    if (origin) {
      try {
        const parsed = new URL(origin);
        const sameOrigin =
          parsed.origin === `${req.protocol}://${req.get("host")}`;
        if (
          parsed.origin !== origin ||
          (!sameOrigin && !allowedOrigins.has(origin))
        )
          return res.status(403).json({
            error: "Cross-origin mutation is not allowed.",
            code: "FORBIDDEN",
          });
      } catch {
        return res
          .status(403)
          .json({ error: "Invalid origin", code: "FORBIDDEN" });
      }
    }
    const key = req.ip ?? "local";
    let r = rates.get(key);
    if (!r || Date.now() - r.start > 3600000) {
      r = { start: Date.now(), count: 0, generation: 0 };
      rates.set(key, r);
    }
    if (++r.count > 6000)
      return res
        .status(429)
        .json({ error: "Too many requests. Try later.", code: "RATE_LIMIT" });
    next();
  });
  const cookie = (res: express.Response, token: string) =>
    res.cookie(cookieName, token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.COOKIE_SECURE === "true",
      maxAge: 7 * 86400000,
      path: "/",
    });
  const session = (req: express.Request, res: express.Response) => {
    const token = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1);
    const s = store.session(token, modelStatus);
    if (s.token !== token) cookie(res, s.token);
    return s;
  };
  const view = (session: Session): WorkspaceState => {
    const s = store.read(session.workspaceId)!;
    s.role = session.role;
    s.demoReview = !session.independent;
    s.model = modelStatus;
    return s;
  };
  // Explicitly shared case-study access, provisioned outside source control.
  // Never included in initial HTML, normal workspace state or logs.
  const portfolioPassword = (): string | null => {
    try {
      const raw = JSON.parse(
        readFileSync(
          options.portfolioAccessPath ?? "data/portfolio-access.json",
          "utf8",
        ),
      );
      return typeof raw.password === "string" &&
        raw.password.length > 0 &&
        raw.password.length <= 256
        ? raw.password
        : null;
    } catch {
      return null;
    }
  };
  app.get("/api/portfolio-access", (_req, res) => {
    res.json({ available: portfolioPassword() !== null });
  });
  app.post("/api/portfolio-access/reveal", (_req, res) => {
    const password = portfolioPassword();
    if (!password)
      return res
        .status(503)
        .json({ error: "Portfolio access is not configured." });
    res.json({ password });
  });
  app.get("/api/health", async (_req, res) =>
    res.json({ ok: true, model: await checkModel(), sandbox: true }),
  );
  app.get(["/api/session", "/api/state"], (req, res) =>
    res.json(view(session(req, res))),
  );
  app.post("/api/actions", (req, res) => {
    const parsed = command.safeParse(req.body);
    if (!parsed.success)
      throw new DomainError(
        400,
        "Invalid action payload. " +
          parsed.error.issues.map((i) => i.message).join("; "),
      );
    const a = parsed.data as Action;
    const ss = session(req, res);
    if (a.type === "switchRole") store.setRole(ss, a.role);
    if (a.type === "startGeneration" || a.type === "retryGeneration") {
      const r = rates.get(req.ip ?? "local")!;
      if (++r.generation > 24)
        throw new DomainError(
          429,
          "This device reached its hourly live-generation limit. Reset does not clear this limit.",
        );
    }
    if (a.type === "reset") {
      if (ss.independent)
        throw new DomainError(
          403,
          "Reviewer cannot reset the operator workspace",
        );
      store.transaction(() => {
        store.db
          .prepare("DELETE FROM reviewer_invites WHERE workspace_id=?")
          .run(ss.workspaceId);
        store.db
          .prepare("DELETE FROM sessions WHERE workspace_id=? AND token<>?")
          .run(ss.workspaceId, ss.token);
        store.db
          .prepare("DELETE FROM receipts WHERE workspace_id=?")
          .run(ss.workspaceId);
        store.db
          .prepare("DELETE FROM jobs WHERE workspace_id=?")
          .run(ss.workspaceId);
        store.db
          .prepare("DELETE FROM document_revisions WHERE workspace_id=?")
          .run(ss.workspaceId);
        store.db
          .prepare("DELETE FROM source_revisions WHERE workspace_id=?")
          .run(ss.workspaceId);
        store.save(initialState(ss.workspaceId, Date.now(), modelStatus));
        store.db
          .prepare("DELETE FROM release_snapshots WHERE workspace_id=?")
          .run(ss.workspaceId);
      });
    } else
      store.mutate(ss.workspaceId, (s) => {
        s.role = ss.role;
        s.demoReview = !ss.independent;
        s.model = modelStatus;
        applyAction(s, a);
        if (a.type === "enqueue") store.enqueue(s);
      });
    res.json(view(ss));
  });
  app.post("/api/reviewer-invite", (req, res) =>
    res.json({
      invite: store.createInvite(session(req, res)),
      expiresInSeconds: 3600,
    }),
  );
  app.post("/api/reviewer-accept", (req, res) => {
    const token = z.string().min(30).max(200).parse(req.body.invite);
    const ss = store.acceptInvite(token);
    cookie(res, ss.token);
    res.json(view(ss));
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  });
  app.post("/api/import", upload.single("file"), async (req, res) => {
    const ss = session(req, res);
    if (ss.role !== "operator")
      throw new DomainError(403, "Reviewer cannot import source material");
    let text: string;
    let title =
      typeof req.body.title === "string"
        ? req.body.title.slice(0, 120)
        : "Imported brief";
    if (req.file) {
      const ext = req.file.originalname.split(".").pop()?.toLowerCase();
      title =
        title === "Imported brief"
          ? req.file.originalname.slice(0, 120)
          : title;
      if (ext === "pdf") {
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: new Uint8Array(req.file.buffer) });
        try {
          const result = await parser.getText();
          text = result.text;
        } catch {
          throw new DomainError(
            400,
            "This PDF could not be parsed. Paste its text instead.",
          );
        } finally {
          await parser.destroy();
        }
        if (text.trim().length < 40)
          throw new DomainError(
            400,
            "No usable PDF text found. Scanned PDFs require pasted text; OCR is not supported.",
          );
      } else if (["txt", "md", "markdown"].includes(ext ?? "")) {
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(
            req.file.buffer,
          );
        } catch {
          throw new DomainError(400, "Text files must use UTF-8.");
        }
      } else
        throw new DomainError(
          400,
          "Supported files: UTF-8 .txt/.md and text-based .pdf (2 MB maximum).",
        );
    } else {
      text = z.string().min(20).max(30000).parse(req.body.text);
    }
    if (text.length > 30000)
      throw new DomainError(
        400,
        "Extracted source exceeds 30,000 characters. Import a shorter excerpt.",
      );
    store.mutate(ss.workspaceId, (s) => {
      if (s.sources.length >= 30)
        throw new DomainError(429, "Sample source limit reached");
      s.sources.push({
        id: uid(),
        title,
        revision: 1,
        text,
        createdAt: iso(),
        status: "unconfirmed",
      });
      s.revision++;
    });
    res.json(view(ss));
  });
  app.get("/api/releases/:id", (req, res) => {
    const ss = session(req, res);
    const row = store.db
      .prepare(
        "SELECT snapshot FROM release_snapshots WHERE workspace_id=? AND release_id=?",
      )
      .get(ss.workspaceId, req.params.id) as { snapshot: string } | undefined;
    if (!row) throw new DomainError(404, "Release not found");
    res.json(JSON.parse(row.snapshot));
  });
  app.get("/api/documents/:id/revisions", (req, res) => {
    const ss = session(req, res);
    if (!documentId.safeParse(req.params.id).success)
      throw new DomainError(404, "Document not found");
    const rows = store.db
      .prepare(
        "SELECT document FROM document_revisions WHERE workspace_id=? AND document_id=? ORDER BY revision DESC",
      )
      .all(ss.workspaceId, req.params.id) as { document: string }[];
    res.json(rows.map((row) => JSON.parse(row.document)));
  });
  app.get("/api/runs/:id/events", (req, res) => {
    const ss = session(req, res);
    const run = store
      .read(ss.workspaceId)!
      .runs.find((r) => r.id === req.params.id);
    if (!run) throw new DomainError(404, "Run not found");
    const after = Number(req.query.after ?? req.get("Last-Event-ID") ?? 0);
    if (req.get("accept")?.includes("text/event-stream")) {
      res.setHeader("Content-Type", "text/event-stream");
      for (const event of run.events.filter((e) => e.seq > after))
        res.write(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`);
      res.end();
    } else
      res.json({
        runId: run.id,
        status: run.status,
        events: run.events.filter((e) => e.seq > after),
      });
  });
  const dist = resolve(fileURLToPath(new URL("../dist", import.meta.url)));
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(resolve(dist, "index.html")),
    );
  }
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const status =
        error instanceof DomainError
          ? error.status
          : error instanceof z.ZodError || error instanceof multer.MulterError
            ? 400
            : 500;
      res.status(status).json({
        error:
          error instanceof Error ? error.message : "Unexpected server error",
        code: error instanceof DomainError ? error.code : "REQUEST_FAILED",
      });
    },
  );
  return app;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const store = new Store(
    process.env.LAUNCH_DB_PATH ?? "data/launch-studio.sqlite",
  );
  await checkModel();
  const stop = startWorker(store);
  setInterval(() => void checkModel(), 30000).unref();
  const port = Number(process.env.PORT ?? 4310);
  const server = createApp(store).listen(port, "127.0.0.1", () =>
    console.log(`Launch Studio API on http://127.0.0.1:${port}`),
  );
  process.on("SIGTERM", () => {
    stop();
    server.close();
    store.close();
    process.exit(0);
  });
}
