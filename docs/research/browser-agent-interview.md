# Browser-driven setup interview: which mechanism works today

Researched 2026-09-25.

## Question

`skilly setup` (`lib/setup.js`) spawns `claude --model opus /setup-project` (`spawnSync('claude', ['--model', 'opus', '/setup-project'], { cwd, stdio: 'inherit' })`, end of `lib/setup.js`). We want a local two-column browser page. The left column shows live interview question values, from the prototype at `bundles/setup-project/prototypes/setup-interview.prototype.html`. The right column is a real chat with that same running Claude Code session. Both directions must push, not poll: user input in the browser reaches the agent without polling, and agent output (README text, changed question values) reaches the browser without polling. Which mechanism does this today, in plain terminal Claude Code, not the T3 Code desktop app? Recommend one.

Source grading: **P** = primary page/source fetched and quoted. **S** = secondary, flagged where used.

## Recommendation: Claude Code channels (custom two-way channel, webhook/chat-bridge pattern)

Use a custom **channel**: an MCP server, spawned by Claude Code over stdio, that also runs a small localhost HTTP+SSE server serving the two-column page. It is the only mechanism that pushes events into an _already-running_ terminal `claude` session without polling, without restart, and without a second agent identity. Anthropic ships the same pattern today as the **fakechat** reference channel: "a chat UI on localhost" that injects browser messages directly into the session and streams replies back (P, [code.claude.com/docs/en/channels](https://code.claude.com/docs/en/channels)).

Message flow:

```
browser (2-col page)                 local channel MCP server              claude (terminal session)
  POST /  {concept text}       ---->  mcp.notification(                --->  arrives as
                                        'notifications/claude/channel')       <channel source="setup-interview" .../>
                                                                               Claude reasons, writes README,
                                                                               decides new question values
  GET /events (SSE)            <----  mcp.notification via `reply`     <---  Claude calls the `reply` /
  (left column re-renders)            or `update_interview` tool             `update_interview` tool
```

Plugs into skilly at the `lib/setup.js` spawn point: instead of `spawnSync('claude', ['--model', 'opus', '/setup-project'], ...)`, spawn with `--mcp-config <path-to-generated-server-entry> --channels server:setup-interview` (or `--dangerously-load-development-channels server:setup-interview` while channels stay in research preview; the flag is per-entry and skips only the allowlist, not the `channelsEnabled` org policy). `lib/setup.js` (the Node CLI) is the right owner for this, not the skill. MCP servers named at `claude` process start are available immediately, but a server added by the running session itself needs a restart on older Claude Code (see [Open risks](#open-risks--unknowns)); starting it at spawn time sidesteps that entirely. `lib/setup.js` can also open the browser itself (`open`/`xdg-open`/`start`, e.g. via the `open` npm package) once the local HTTP port is listening, before or right after spawning `claude`.

Why this over the alternatives: it is the one mechanism built and documented for exactly this shape. "Chat platforms ... your plugin runs locally ... forwards the message to Claude" / "webhooks ... your server pushes the payload to Claude" (P, [channels-reference](https://code.claude.com/docs/en/channels-reference)). It targets the user's actual running session, not a second agent (unlike the Agent SDK) or a blocking tool call (unlike a plain MCP tool).

## 1. Local MCP server (stdio) with a blocking `wait_for_user_event` tool

Works today as a _tool_, but not as the trigger for agent-initiated pushes. A tool call only runs when the model decides to call it, so the model would have to call `wait_for_user_event` and then sit blocked. There is no "user edits a value, agent reacts on its own" unless the model is made to poll by calling the tool again after each of its own turns, which burns turns and looks unnatural in the transcript.

- Long block is technically survivable: `MCP_TOOL_TIMEOUT` defaults to ~28 hours if unset, and a per-server `timeout` field in `.mcp.json` (≥1000 ms, requires Claude Code v2.1.203+) overrides it (P, [code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp)).
- But Claude Code v2.1.212+ auto-backgrounds any tool call running past 2 minutes (`CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`, default 120000). The model gets a task ID and moves on, and the result arrives later as a notification. A long blocking call does not hold the conversation open the way a channel notification does (P, same source).
- Idle timeout is separate and shorter: stdio servers get 30 minutes of no-response/no-progress before abort (`CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`), though progress notifications reset it (P, same source).
- Verdict: viable for one blocking wait (e.g. "wait for the user to press Done"), not for a live chat. Superseded by channels, which push without a pending call at all.

## 2. Claude Code channels — recommended, details above

- Status: **research preview**, requires Anthropic auth via claude.ai or Console API key, blocked on Bedrock/Google Agent Platform/Microsoft Foundry, gated by `channelsEnabled` for Team/Enterprise (default off there; default on for Console API key orgs and for individual Pro/Max users without an org) (P, [channels](https://code.claude.com/docs/en/channels)).
- Agent waits for input: it doesn't wait — the server pushes a `notifications/claude/channel` MCP notification any time, and Claude Code injects it as a `<channel source="..." ...>` tag into context on the next turn. "Claude Code doesn't acknowledge notifications... If the session hasn't loaded your server as a channel... Claude Code drops the events silently" (P, [channels-reference](https://code.claude.com/docs/en/channels-reference)). Multiple notifications arriving while Claude is busy are queued and delivered together next turn.
- Updates push both ways: inbound via `mcp.notification()` from the channel server; outbound via a standard MCP tool the channel exposes (`reply`, or a custom `update_interview` tool) that Claude calls. The tool handler pushes to the browser over SSE.
- Requirement to register: `capabilities.experimental['claude/channel'] = {}` (required), `capabilities.tools = {}` for two-way, `instructions` string telling Claude how to react and reply (P, same source). Full worked example (webhook.ts, Bun, stdio + local HTTP + SSE) is in the docs and is essentially the skeleton for the setup-interview server.
- Custom channels are not on the research-preview allowlist yet: must launch with `--dangerously-load-development-channels server:<name>` (or `plugin:<name>@<marketplace>` once published) until Anthropic approves it (P, same source).
- Permission prompts: a two-way channel can opt into **relay** (`claude/channel/permission`) so a Bash/Write/Edit approval dialog also appears in the browser, not just the terminal. Useful if `/setup-project` needs approval mid-run while the browser tab has focus (P, same source).
- Mid-session add: current docs state MCP servers, including ones added mid-session, are attempted to connect immediately ("Claude Code attempts to connect it"), but this contradicts several older GitHub issues (#40059, #46426, #23790) reporting tools not available until restart. Flag as **unresolved** below; regardless, spawning `--mcp-config`+`--channels` at `claude` process start (from `lib/setup.js`) avoids the question.
- Flag surface not stable: "Neither `--channels` nor `--dangerously-load-development-channels` appears in `claude --help` while the feature is in preview... the `--channels` flag syntax and protocol contract may change" (P, [channels#research-preview](https://code.claude.com/docs/en/channels#research-preview)).

## 3. MCP elicitation

- Claude Code supports the `claude/elicitation` capability: a server can prompt the user for input, and "a call waiting on an open elicitation dialog isn't backgrounded while the dialog is open ... the server is blocked on your input" (P, [code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp)).
- This is a single blocking request/response per elicitation, driven by the terminal dialog (or a client-side form), not a channel for continuous chat or independent agent-initiated pushes. No documented "URL mode" opens a browser page as the elicitation surface; MCP's own elicitation spec (P, [modelcontextprotocol.io/specification/2025-06-18/client/elicitation](https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation)) defines the request/response shape only, and rendering is client-defined.
- Fits "ask one structured question, block until answered" (e.g. the goal text), not the two-way live interview.

## 4. MCP Apps (`ui://` resources, ext-apps)

- **Not rendered in terminal Claude Code.** Open issue: "Claude Code connects to MCP servers but does not render MCP Apps (SEP-1865) UI resources. A tool bound to a `ui://` resource via `_meta.ui.resourceUri` returns its text result and the UI is dropped" (P/S via search snippet of GitHub issue, [anthropics/claude-code#95149](https://github.com/anthropics/claude-code/issues/95149), filed ~mid-September 2026). MCP Apps overview confirms the mechanism (iframe embedding, `text/html;profile=mcp-app`) is designed for chat clients that render inline UI, which the terminal is not (P, [modelcontextprotocol.io/extensions/apps/overview](https://modelcontextprotocol.io/extensions/apps/overview)).
- Ruled out for plain terminal Claude Code today.

## 5. Claude Agent SDK (TypeScript) driving a local web server

- Streaming input mode is the SDK's own recommended pattern for a persistent chat: an async generator yields `SDKUserMessage`s while `query()` streams responses, giving "real-time feedback," "queued messages," full tool/MCP access (P, [code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode](https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode)). A local web server could feed the generator from browser input and stream `query()` output back — mechanically this works today.
- Fatal tradeoff for this use case: it is a **second, separate agent process**, not the user's already-running `/setup-project` session. It defeats "the agent (the running Claude Code session) reacts," and duplicates context and tool state.
- Auth: Anthropic's usage policy is explicit. "Developers building products or services that interact with Claude's capabilities, including those using the Agent SDK, should use API key authentication through Claude Console... Anthropic does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users" (P, [code.claude.com/docs/en/legal-and-compliance](https://code.claude.com/docs/en/legal-and-compliance)). OAuth/subscription auth is reserved for "ordinary use of Claude Code and other native Anthropic applications." A skilly-shipped Agent SDK server driving setup for arbitrary users would need its own API key billing, not the user's Claude subscription: a real cost and complexity addition the channel approach avoids, since channels run inside the user's own authenticated `claude` process.

## 6. `claude -p --input-format stream-json --output-format stream-json` subprocess

- This is the CLI-level door into the same streaming-input machinery the Agent SDK wraps (`-p` = headless/print mode; stream-json in/out is the wire format `SDKUserMessage`/`SDKMessage` use). Same verdict as option 5: a fresh subprocess is a new session, not the interactive terminal session the user is already looking at and typing `/setup-project` into. Also loses the terminal UI (permission prompts, plan mode, etc.) that `/setup-project` may rely on unless independently re-implemented.
- Only useful if the design changes to "browser is the only interface, no terminal session at all." That is explicitly out of scope here: the ask is the _running_ Claude Code session.

## 7. Hooks + file polling

- Weak fallback: a `PostToolUse`/`Stop` hook could write interview state to a file the browser polls, and a background watcher could write back into a file the agent's next tool call reads. No push in either direction: both sides poll, latency grows, and it needs a hack (e.g. a slash-command loop or repeated tool calls) to make the agent notice file changes between its own turns. Not recommended; channels remove the need for this entirely.

## Open risks / unknowns

- **Mid-session MCP add contradiction.** Current `code.claude.com/docs/en/mcp` text says servers added mid-session connect immediately; multiple open GitHub issues (#40059, #46426, #23790) say tools aren't usable until restart. Recommendation sidesteps this by registering the channel at `claude` spawn time from `lib/setup.js`, but the discrepancy itself is unresolved and worth a smoke test before relying on any mid-session add path elsewhere in skilly.
- **Research preview instability.** Channels' flag syntax and protocol "may change based on feedback" (P, channels docs). Pin a Claude Code version in skilly's setup docs once this ships, and re-check before each skilly release.
- **`--dangerously-load-development-channels` UX.** Shows a full-screen warning dialog on every launch until the channel is allowlisted. Needs a decision on whether `skilly setup` accepts that friction, waits for allowlisting, or ships as an official plugin.
- **`channelsEnabled` org gate.** Team/Enterprise orgs default to channels blocked; an org Owner must enable it under claude.ai admin settings. skilly's setup flow would silently degrade (or should detect and fall back) for such users.
- **Permission-relay interaction untested.** Whether relaying Bash/Write/Edit approvals into the same browser tab (vs. leaving them in the terminal) is desirable for `/setup-project`'s own file/git operations needs a design call, not just a feasibility check.
- **Bun dependency.** Anthropic's first-party channel plugins use Bun; a custom skilly channel does not have to (docs confirm Node/Deno also work against `@modelcontextprotocol/sdk`), but skilly's own runtime story (all-Node CLI) should pick one explicitly to avoid adding Bun as a dep just for this.
- **Version pins for cited behavior**: `.mcp.json` per-server timeout needs Claude Code ≥v2.1.203; auto-backgrounding needs ≥v2.1.212; permission-relay `false` semantics fixed in v2.1.234; permission-relay only sent to channel-registered servers as of v2.1.234. Confirm the skilly-targeted Claude Code version meets these floors before shipping.
