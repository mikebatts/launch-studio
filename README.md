# Launch Studio

A working course-launch workflow, designed and built by [Michael Battaglia](https://mikebatts.net).

Edit an invitation, preview it for different learners, handle a changed course date without losing your writing, and approve the exact messages that arrive in a sandbox inbox.

An independent exploration of AI-assisted internal tools. Not affiliated with Chess.com. The course and players are fictional; no external email is sent.

## Try the workflow

1. Start with the supplied course brief and edit the free-sample invitation.
2. Request a live headline suggestion. Accept it or keep your copy.
3. Compare included access, free-sample access and a player who should receive no invitation.
4. Change the course date. Review the affected fields without replacing your headline or message.
5. Inspect all four email/in-app variants, mark each reviewed and approve the complete version.
6. Send to the sandbox inbox, open the persisted invitation and play the short course sample.

The guided launch and full workspace share the same drafts, proposals and review records. The full workspace exposes audience rules, source import, comments, reviewer invitations, schedules and delivery history.

## Run locally

Requires Node 22.13+ in the 22.x release line and npm. Live drafting also needs [Ollama](https://ollama.com).

```sh
npm ci
ollama pull qwen3:4b
npm run dev
```

Start Ollama locally using its installation instructions. Open `http://127.0.0.1:5173`. The API runs on port 4310 and SQLite data stays in the ignored `data/` directory. The app remains editable when the model is unavailable and does not pretend a supplied response is live.

```sh
npm test
npm run typecheck
npm run build
npm start
```

After a production build, the Node server serves the app and API together. There is no paid-model API fallback.

## Deployment

This repository includes a Vercel frontend and API-proxy configuration. Set `LAUNCH_BACKEND_ORIGIN` in the Vercel project to the HTTPS origin of the separately running backend, then deploy. The browser uses same-origin `/api` requests; `api/proxy.ts` forwards only known API routes, preserves session cookies and disables response caching.

**Vercel does not host the SQLite database, the background worker or Ollama in this arrangement.** Keep those on an always-running host with persistent storage. If that host is a personal computer, the demo still depends on that computer staying online. No browser requests an OpenAI key or uses a ChatGPT subscription as an app API.

Backend production settings:

- `NODE_ENV=production`
- `PORT`: loopback listener port
- `LAUNCH_DB_PATH`: persistent SQLite file path
- `COOKIE_SECURE=true`
- `LAUNCH_ALLOWED_ORIGINS`: exact backend HTTPS origin
- `LAUNCH_SESSION_COOKIE`: distinct cookie name for each separately hosted environment
- `LAUNCH_TRUST_LOCAL_PROXY=true` only behind a trusted loopback proxy

The portfolio card optionally supports explicitly shared case-study access. `python3 scripts/set-portfolio-access.py` provisions that value through a local hidden prompt. It is excluded from git, initial HTML and workspace state; revealing it requires a separate no-store request. Do not put account or API credentials there.

## What to inspect in the code

- **Human edits survive AI and source changes.** Field-level proposals capture their base revision. Conflicts require an explicit decision instead of replacing newer writing.
- **Preview is not targeting.** Recipient policy is evaluated separately from the person selected in the preview.
- **Review belongs to a frozen version.** Copy, source/rule revisions, recipient bindings and the dispatch plan are frozen together. New candidates reset message-review acknowledgments; changes invalidate approval.
- **Delivery is a stored result.** SQLite transactions, recipient delivery keys and worker fences prevent duplicate or stale writes. The inbox uses the committed payload, not today's editor content.
- **Failures remain visible.** Generation can stop, retry or fail without silently applying copy. Queued work and event identity persist.

See [architecture](docs/architecture.md) and [review UI patterns](docs/review-patterns.md).

## Project map

- `src/`: React interface, guided flow and reusable review components.
- `api/proxy.ts`: stateless Vercel-to-backend proxy.
- `shared/types.ts`: document, action and release contracts.
- `server/domain.ts`: edit, proposal, targeting, review and approval rules.
- `server/store.ts`: SQLite persistence, sessions, revisions, invitations and receipts.
- `server/model.ts`: local model adapter and bounded output checks.
- `server/worker.ts`: model jobs and sandbox delivery.
- `tests/` and colocated tests: proxy, domain, persistence, draft recovery and complete guided interaction checks.

## Scope and verification

38 automated tests cover meaningful recovery and negative cases, including stale edits, incomplete review, role enforcement, receipt deduplication, cancellation, source changes, proxy behavior and the complete interaction-to-delivery path. Live model and HTTPS delivery checks were also performed separately. The latest layout still needs rendered desktop/mobile review; passing tests does not establish visual quality.

The guest review role is explicitly controlled by the visitor, not independent human approval. One-use reviewer invitations create separate restricted sessions but do not verify a person's identity. The 250 players are synthetic. The chess exercise checks a specific authored knight fork with chess.js, not a general tutoring engine. No internal Chess.com data, integrations or marketing results are claimed.

Original code is MIT licensed. Third-party dependencies retain their respective licenses; see [notices](THIRD_PARTY_NOTICES.md).
