import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
import {
  initialState,
  uid,
  iso,
  evaluate,
  fingerprint,
  DomainError,
} from "./domain.ts";
import type { WorkspaceState, ModelStatus, Receipt } from "../shared/types.ts";
export interface Session {
  token: string;
  workspaceId: string;
  role: "operator" | "reviewer";
  independent: boolean;
}
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(
      `PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY,state TEXT NOT NULL,expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,role TEXT NOT NULL,independent INTEGER NOT NULL DEFAULT 0); CREATE TABLE IF NOT EXISTS document_revisions(workspace_id TEXT,document_id TEXT,revision INTEGER,document TEXT NOT NULL,PRIMARY KEY(workspace_id,document_id,revision)); CREATE TABLE IF NOT EXISTS source_revisions(workspace_id TEXT,source_id TEXT,revision INTEGER,source TEXT NOT NULL,PRIMARY KEY(workspace_id,source_id,revision)); CREATE TABLE IF NOT EXISTS receipts(delivery_key TEXT PRIMARY KEY,workspace_id TEXT,release_id TEXT,receipt TEXT NOT NULL); CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,workspace_id TEXT,release_id TEXT,fence INTEGER,lease_token TEXT,lease_until INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL); CREATE TABLE IF NOT EXISTS reviewer_invites(hash TEXT PRIMARY KEY,workspace_id TEXT,expires INTEGER,used INTEGER NOT NULL DEFAULT 0);`,
    );
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS release_snapshots(release_id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,snapshot TEXT NOT NULL)",
    );
  }
  close() {
    this.db.close();
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  read(id: string): WorkspaceState | undefined {
    const row = this.db
      .prepare("SELECT state,expires FROM workspaces WHERE id=?")
      .get(id) as { state: string; expires: number } | undefined;
    if (!row || row.expires < Date.now()) return;
    return JSON.parse(row.state);
  }
  save(s: WorkspaceState) {
    const previous = this.read(s.id)?.candidate;
    if (previous && previous.id !== s.candidate?.id) {
      if (!["delivered", "cancelled"].includes(previous.status)) {
        previous.status = "cancelled";
        previous.fence++;
        previous.reason =
          "Superseded by a newly prepared candidate. Any committed messages remain delivered.";
      }
      this.db
        .prepare("INSERT OR REPLACE INTO release_snapshots VALUES(?,?,?)")
        .run(previous.id, s.id, JSON.stringify(previous));
    }
    if (s.candidate)
      this.db
        .prepare("INSERT OR REPLACE INTO release_snapshots VALUES(?,?,?)")
        .run(s.candidate.id, s.id, JSON.stringify(s.candidate));
    this.db
      .prepare(
        "INSERT INTO workspaces(id,state,expires) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,expires=excluded.expires",
      )
      .run(s.id, JSON.stringify(s), Date.parse(s.expiresAt));
    for (const d of Object.values(s.documents))
      this.db
        .prepare("INSERT OR IGNORE INTO document_revisions VALUES(?,?,?,?)")
        .run(s.id, d.id, d.revision, JSON.stringify(d));
    for (const source of s.sources)
      this.db
        .prepare("INSERT OR IGNORE INTO source_revisions VALUES(?,?,?,?)")
        .run(s.id, source.id, source.revision, JSON.stringify(source));
  }
  mutate<T>(id: string, fn: (state: WorkspaceState) => T): T {
    return this.transaction(() => {
      const s = this.read(id);
      if (!s)
        throw new DomainError(
          404,
          "Workspace expired. Reload to create a fresh sample.",
        );
      const out = fn(s);
      this.save(s);
      return out;
    });
  }
  session(token: string | undefined, model: ModelStatus): Session {
    if (token) {
      const row = this.db
        .prepare("SELECT * FROM sessions WHERE token=?")
        .get(token) as
        | { workspace_id: string; role: Session["role"]; independent: number }
        | undefined;
      if (row && this.read(row.workspace_id))
        return {
          token,
          workspaceId: row.workspace_id,
          role: row.role,
          independent: !!row.independent,
        };
    }
    const s = initialState(uid(), Date.now(), model);
    this.save(s);
    const session: Session = {
      token: uid() + uid(),
      workspaceId: s.id,
      role: "operator",
      independent: false,
    };
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?,?)")
      .run(session.token, s.id, session.role, 0);
    return session;
  }
  setRole(session: Session, role: Session["role"]) {
    if (session.independent)
      throw new DomainError(
        403,
        "This invited session has reviewer-only permission.",
      );
    this.db
      .prepare("UPDATE sessions SET role=? WHERE token=?")
      .run(role, session.token);
    session.role = role;
  }
  createInvite(session: Session) {
    if (session.role !== "operator")
      throw new DomainError(403, "Only the operator may invite a reviewer");
    const token = uid() + uid();
    this.db
      .prepare("INSERT INTO reviewer_invites VALUES(?,?,?,0)")
      .run(
        createHash("sha256").update(token).digest("hex"),
        session.workspaceId,
        Date.now() + 3600000,
      );
    return token;
  }
  acceptInvite(token: string): Session {
    return this.transaction(() => {
      const hash = createHash("sha256").update(token).digest("hex");
      const row = this.db
        .prepare("SELECT * FROM reviewer_invites WHERE hash=?")
        .get(hash) as
        { workspace_id: string; expires: number; used: number } | undefined;
      if (
        !row ||
        row.used ||
        row.expires < Date.now() ||
        !this.read(row.workspace_id)
      )
        throw new DomainError(
          400,
          "Invite is invalid, expired or already used.",
        );
      this.db
        .prepare("UPDATE reviewer_invites SET used=1 WHERE hash=?")
        .run(hash);
      const session: Session = {
        token: uid() + uid(),
        workspaceId: row.workspace_id,
        role: "reviewer",
        independent: true,
      };
      this.db
        .prepare("INSERT INTO sessions VALUES(?,?,?,1)")
        .run(session.token, session.workspaceId, "reviewer");
      return session;
    });
  }
  workspaces(): string[] {
    return (
      this.db
        .prepare("SELECT id FROM workspaces WHERE expires>?")
        .all(Date.now()) as { id: string }[]
    ).map((r) => r.id);
  }
  enqueue(s: WorkspaceState) {
    const c = s.candidate!;
    this.db
      .prepare(
        "INSERT OR IGNORE INTO jobs(id,workspace_id,release_id,fence,status) VALUES(?,?,?,?,?)",
      )
      .run(c.id, s.id, c.id, c.fence, "queued");
  }
  claim(
    id: string,
    now = Date.now(),
  ): { token: string; fence: number; releaseId: string } | null {
    return this.transaction(() => {
      const s = this.read(id);
      const c = s?.candidate;
      if (
        !s ||
        !c ||
        !["queued", "delivering"].includes(c.status) ||
        Date.parse(c.plan.at) > now
      )
        return null;
      const row = this.db.prepare("SELECT * FROM jobs WHERE id=?").get(c.id) as
        { lease_until: number } | undefined;
      if (!row || row.lease_until > now) return null;
      if (c.fingerprint !== fingerprint(s)) {
        c.status = "paused";
        c.fence++;
        c.reason = "Approval became stale at dispatch";
        this.save(s);
        return null;
      }
      const token = uid();
      this.db
        .prepare(
          "UPDATE jobs SET lease_token=?,lease_until=?,fence=?,status=? WHERE id=?",
        )
        .run(token, now + 30000, c.fence, "running", c.id);
      c.status = "delivering";
      this.save(s);
      return { token, fence: c.fence, releaseId: c.id };
    });
  }
  commitRecipient(
    workspaceId: string,
    claim: { token: string; fence: number; releaseId: string },
    index: number,
    now = Date.now(),
  ): boolean {
    return this.transaction(() => {
      const s = this.read(workspaceId);
      const c = s?.candidate;
      const job = this.db
        .prepare("SELECT * FROM jobs WHERE id=?")
        .get(claim.releaseId) as
        { lease_token: string; lease_until: number } | undefined;
      if (
        !s ||
        !c ||
        c.id !== claim.releaseId ||
        c.fence !== claim.fence ||
        job?.lease_token !== claim.token ||
        job.lease_until <= now ||
        c.status !== "delivering"
      )
        return false;
      if (c.fingerprint !== fingerprint(s)) {
        c.status = "paused";
        c.fence++;
        c.reason = "Current source/content policy differs from approval";
        this.save(s);
        return false;
      }
      const binding = c.bindings[index];
      if (!binding) return false;
      const key = `${c.id}:${binding.playerId}:${binding.channel}`;
      if (
        this.db
          .prepare("SELECT delivery_key FROM receipts WHERE delivery_key=?")
          .get(key)
      )
        return true;
      const p = s.players.find((p) => p.id === binding.playerId)!;
      const current = evaluate([p], s.rules, now).players[0];
      const eligible =
        current[binding.channel] && current.variant === binding.variant;
      const d = c.documents[binding.documentId];
      const r: Receipt = {
        id: uid(),
        releaseId: c.id,
        playerId: p.id,
        playerName: p.name,
        channel: binding.channel,
        variant: binding.variant,
        documentId: d.id,
        documentRevision: d.revision,
        status: eligible ? "delivered" : "suppressed",
        reason: eligible
          ? undefined
          : current.variant !== binding.variant
            ? "Membership changed — approved access variant no longer applies"
            : current[`${binding.channel}Reasons`].join("; "),
        createdAt: iso(now),
        fields: structuredClone(d.fields),
        template: d.template,
        rendererVersion: 1,
        deliveryKey: key,
      };
      this.db
        .prepare("INSERT INTO receipts VALUES(?,?,?,?)")
        .run(key, s.id, c.id, JSON.stringify(r));
      s.receipts.push(r);
      if (eligible)
        s.events.push({
          id: uid(),
          receiptId: r.id,
          playerId: p.id,
          type: "message_written",
          at: iso(now),
        });
      s.revision++;
      this.save(s);
      return true;
    });
  }
  finish(
    workspaceId: string,
    claim: { token: string; fence: number; releaseId: string },
    now = Date.now(),
  ) {
    this.mutate(workspaceId, (s) => {
      const c = s.candidate;
      const job = this.db
        .prepare("SELECT lease_token,lease_until FROM jobs WHERE id=?")
        .get(claim.releaseId) as
        { lease_token: string; lease_until: number } | undefined;
      if (
        c?.id === claim.releaseId &&
        c.fence === claim.fence &&
        job?.lease_token === claim.token &&
        job.lease_until > now &&
        c.status === "delivering" &&
        c.bindings.every((binding) =>
          this.db
            .prepare("SELECT delivery_key FROM receipts WHERE delivery_key=?")
            .get(`${c.id}:${binding.playerId}:${binding.channel}`),
        )
      ) {
        c.status = "delivered";
        c.revision++;
        this.db
          .prepare("UPDATE jobs SET status=?,lease_until=0 WHERE id=?")
          .run("completed", c.id);
      }
    });
  }
}
