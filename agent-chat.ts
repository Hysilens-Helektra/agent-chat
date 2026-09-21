/**
 * Agent-to-Agent chat client.
 *
 * Tools: agent_chat_register / agent_chat_list / agent_chat_send.
 * Connects to the local server (127.0.0.1:41729 by default); only
 * agent_chat_register spawns it detached when absent. Sessions own their
 * registration: session end destroys the connection (offline), and a new
 * session registers again.
 *
 * Incoming peer messages are pushed to the agent as user messages:
 * immediately when idle, otherwise as a steering message delivered after
 * the current turn's tool calls. Each pushed message carries a server-
 * assigned mid; the client acks "buffered" once pi accepted the message
 * and "delivered" when pi emits message_start for it (the same signal pi
 * uses internally to dequeue steering messages), so agent_chat_send can
 * report per-target delivery status.
 *
 * Env overrides: AGENT_CHAT_PORT, AGENT_CHAT_SERVER (path to server.mjs).
 */
import { spawn } from "node:child_process";
import net from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const HOST = "127.0.0.1";
const PORT = Number(process.env.AGENT_CHAT_PORT ?? 41729);
const SERVER = process.env.AGENT_CHAT_SERVER ?? join(homedir(), "agent-chat", "server.mjs");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function (pi: ExtensionAPI) {
	let sock: net.Socket | null = null;
	let buf = "";
	let rid = 0;
	const waiting = new Map<number, (m: any) => void>();
	let ctx: ExtensionContext | null = null;
	let everRegistered = false;

	/** mid -> exact text injected into the session, awaiting message_start. */
	const pendingDelivery = new Map<number, string>();

	const text = (t: string) => ({ content: [{ type: "text" as const, text: t }], details: {} });

	function notify(msg: Record<string, unknown>) {
		if (!sock || sock.destroyed) return;
		try {
			sock.write(JSON.stringify(msg) + "\n");
		} catch {}
	}

	function onPush(m: any) {
		if (m.type === "message") {
			const body =
				`[agent-chat] Message from agent "${m.from}" at ${m.ts}:\n${m.text}\n` +
				"(Peer message relayed by the agent-chat extension, not from the user. Reply with agent_chat_send.)";
			const mid = typeof m.mid === "number" ? m.mid : undefined;
			if (mid !== undefined) {
				pendingDelivery.set(mid, body);
				if (pendingDelivery.size > 50) pendingDelivery.delete(pendingDelivery.keys().next().value!);
			}
			// pi.sendUserMessage returns void and reports rejections on pi's own
			// error channel, so "buffered" means pi accepted the hand-off. A message
			// pi later drops (e.g. compaction in progress) never fires message_start,
			// so the sender sees "unread" when the server's window closes.
			let queued = false;
			if (ctx) {
				try {
					if (ctx.isIdle()) pi.sendUserMessage(body);
					else pi.sendUserMessage(body, { deliverAs: "steer" });
					queued = true;
				} catch {}
			}
			if (mid !== undefined) notify({ type: "ack", mid, stage: queued ? "buffered" : "failed" });
			return;
		}
		if (m.type === "presence") {
			const verb = m.event === "online" ? "online" : "offline";
			const msg = `[agent-chat] Agent "${m.name}" went ${verb} at ${m.ts}${m.task ? ` (task: ${m.task})` : ""}.`;
			deliver(msg);
		}
	}

	function deliver(msg: string) {
		if (!ctx) return;
		try {
			if (ctx.isIdle()) void pi.sendUserMessage(msg);
			else void pi.sendUserMessage(msg, { deliverAs: "steer" });
		} catch {
			// Stale runtime after session replacement; the next tool call reconnects.
		}
	}

	function attach(s: net.Socket): net.Socket {
		sock = s;
		buf = "";
		s.setEncoding("utf8");
		s.on("data", (chunk) => {
			buf += chunk;
			for (let i; (i = buf.indexOf("\n")) >= 0; ) {
				const line = buf.slice(0, i);
				buf = buf.slice(i + 1);
				if (!line.trim()) continue;
				let m: any;
				try {
					m = JSON.parse(line);
				} catch {
					continue;
				}
				const w = m.rid !== undefined ? waiting.get(m.rid) : undefined;
				if (w) {
					waiting.delete(m.rid);
					w(m);
				} else {
					onPush(m);
				}
			}
		});
		s.on("close", () => {
			if (sock === s) sock = null;
			for (const [id, w] of waiting) {
				waiting.delete(id);
				w({ type: "error", message: "Connection closed." });
			}
			// Real loss: the closed socket was our live one (no replacement) and
			// we had registered. Orphan/replaced sockets must not trigger this.
			if (!sock && everRegistered) {
				deliver(
					"[agent-chat] Chat server connection lost (server process exited). " +
						"All registrations are gone; other agents are unreachable until they re-register. " +
						"Call agent_chat_register to go back online.",
				);
			}
		});
		s.on("error", () => {});
		return s;
	}

	function dial(): Promise<net.Socket> {
		return new Promise((resolve, reject) => {
			const s = net.connect({ host: HOST, port: PORT });
			s.once("connect", () => resolve(s));
			s.once("error", reject);
		});
	}

	// spawn: only agent_chat_register may start the server. Concurrent callers
	// share one in-flight dial so parallel tool calls never open extra lines.
	let connecting: Promise<net.Socket> | null = null;
	async function getSocket(spawnIfMissing: boolean): Promise<net.Socket> {
		if (sock && !sock.destroyed) return sock;
		if (!connecting) {
			connecting = (async () => {
				try {
					return attach(await dial());
				} catch {}
				if (!spawnIfMissing) throw new Error("Chat server is not running. Call agent_chat_register first.");
				// No server: spawn it detached, then wait for the port to open.
				try {
					spawn(process.execPath, [SERVER], { detached: true, stdio: "ignore" }).unref();
				} catch {}
				for (let i = 0; i < 20; i++) {
					await sleep(150);
					try {
						return attach(await dial());
					} catch {}
				}
				throw new Error("Cannot connect to the server.");
			})();
			connecting.then(
				() => (connecting = null),
				() => (connecting = null),
			);
		}
		return connecting;
	}

	async function rpc(msg: Record<string, unknown>, opts: { spawn?: boolean; timeout?: number } = {}): Promise<any> {
		const s = await getSocket(opts.spawn === true);
		const id = ++rid;
		return await new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				waiting.delete(id);
				reject(new Error("Timeout."));
			}, opts.timeout ?? 5000);
			waiting.set(id, (m) => {
				clearTimeout(timer);
				resolve(m);
			});
			s.write(JSON.stringify({ ...msg, rid: id }) + "\n");
		});
	}

	pi.registerTool({
		name: "agent_chat_register",
		label: "Agent Chat: Register",
		description:
			"Register this agent on the local agent-to-agent chat server so other coding agents on this machine can see your task and message you. Call once before agent_chat_send / agent_chat_list; call again to update your task summary. Incoming peer messages arrive as user messages prefixed with [agent-chat].",
		parameters: Type.Object({
			task_summary: Type.String({ description: "One-sentence summary of what you are working on" }),
			username: Type.Optional(
				Type.String({ description: 'Preferred username. Omit to let the server generate one ("all" is rejected).' }),
			),
		}),
		async execute(_id, params, _signal, _onUpdate, toolCtx) {
			ctx = toolCtx;
			try {
				const r = await rpc(
					{
						type: "register",
						pid: process.pid,
						cwd: toolCtx.cwd,
						task: params.task_summary,
						username: params.username,
					},
					{ spawn: true },
				);
				if (r.type === "error") return text(`Failed: ${r.message}`);
				everRegistered = true;
				let out = `Registration successful.\nYour username: ${r.name}\nServers remaining: ${r.others} agents`;
				if (r.note) out += `\n${r.note}`;
				return text(out);
			} catch (e) {
				return text(`Failed: ${e instanceof Error ? e.message : "Cannot connect to the server."}`);
			}
		},
	});

	pi.registerTool({
		name: "agent_chat_list",
		label: "Agent Chat: List",
		description: "List all agent users currently online on the local agent-to-agent chat server.",
		parameters: Type.Object({}),
		async execute(_id, _params, _signal, _onUpdate, toolCtx) {
			ctx = toolCtx;
			try {
				const r = await rpc({ type: "list" });
				if (r.type === "error") return text(`Failed: ${r.message}`);
				const users = r.users as Array<{ name: string; pid: number; task: string; cwd: string }>;
				const body = users
					.map((u) => `\nName: ${u.name}\nPID: ${u.pid}\nTask Summary: ${u.task}\nWorking Directory: ${u.cwd}\n`)
					.join("\n");
				return text(`There are ${users.length} agent users in total.\n${body}`);
			} catch (e) {
				return text(`Failed: ${e instanceof Error ? e.message : "Cannot connect to the server."}`);
			}
		},
	});

	pi.registerTool({
		name: "agent_chat_send",
		label: "Agent Chat: Send",
		description: 'Send a message to other agent users on this machine. Use ["all"] to broadcast to every other agent.',
		parameters: Type.Object({
			to: Type.Array(Type.String(), { description: 'Target usernames, or ["all"] to broadcast to all other agents' }),
			message: Type.String({ description: "Message body" }),
		}),
		async execute(_id, params, _signal, _onUpdate, toolCtx) {
			ctx = toolCtx;
			try {
				// The server holds the reply up to 5s collecting receiver acks.
				const r = await rpc({ type: "send", targets: params.to, text: params.message }, { timeout: 6500 });
				if (r.type === "error") return text(r.code === "self" ? r.message : `Failed: ${r.message}`);
				if (r.ok.length === 0 && r.unread.length === 0 && r.failed.length === 0) {
					return text("Success, but there are no other agents on the server.");
				}
				const list = (names: string[]) => (names.length ? ` ${names.join(", ")}` : "");
				return text(
					`Received and already read:${list(r.ok)}\n` +
						`Received, agent busy and temporarily unread in 5s:${list(r.unread)}\n` +
						`Failed to receive:${list(r.failed)}`,
				);
			} catch (e) {
				return text(`Failed: ${e instanceof Error ? e.message : "Cannot connect to the server."}`);
			}
		},
	});

	// pi dequeues steering messages on exactly this event, so it is the
	// authoritative "the injected message entered the LLM call" signal.
	pi.on("message_start", async (event) => {
		if (event.message.role !== "user") return;
		const c = event.message.content;
		const t = typeof c === "string" ? c : c.filter((p) => p.type === "text").map((p) => p.text).join("\n");
		for (const [mid, body] of pendingDelivery) {
			if (body === t) {
				pendingDelivery.delete(mid);
				notify({ type: "ack", mid, stage: "delivered" });
				return;
			}
		}
	});

	pi.on("session_start", async (_event, c) => {
		ctx = c;
	});

	pi.on("session_shutdown", async () => {
		// Session end = this agent goes offline. A new session is a fresh instance
		// that registers again; the server detects the closed socket and broadcasts
		// offline, so no deregister protocol is needed.
		ctx = null;
		everRegistered = false;
		pendingDelivery.clear();
		if (sock) {
			const s = sock;
			sock = null;
			s.destroy();
		}
	});
}
