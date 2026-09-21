/**
 * End-to-end check for server.mjs. Run: node --test test.mjs
 * Spawns a throwaway server on a test port and drives it with two raw clients.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import net from "node:net";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const PORT = 41799;
const serverPath = join(dirname(fileURLToPath(import.meta.url)), "server.mjs");
let proc;

function client() {
	const sock = net.connect({ host: "127.0.0.1", port: PORT });
	sock.setEncoding("utf8");
	const queue = [];
	const waiters = [];
	let buf = "";
	sock.on("data", (chunk) => {
		buf += chunk;
		for (let i; (i = buf.indexOf("\n")) >= 0; ) {
			const line = buf.slice(0, i);
			buf = buf.slice(i + 1);
			if (!line.trim()) continue;
			const msg = JSON.parse(line);
			const w = waiters.shift();
			if (w) w(msg);
			else queue.push(msg);
		}
	});
	return {
		sock,
		send: (obj, rid) => sock.write(JSON.stringify({ ...obj, rid }) + "\n"),
		next: () => (queue.length ? Promise.resolve(queue.shift()) : new Promise((r) => waiters.push(r))),
	};
}

test.before(async () => {
	proc = spawn(process.execPath, [serverPath], {
		env: { ...process.env, AGENT_CHAT_PORT: String(PORT) },
		stdio: "ignore",
	});
	for (let i = 0; i < 50; i++) {
		try {
			await new Promise((res, rej) => {
				const s = net.connect({ host: "127.0.0.1", port: PORT });
				s.once("connect", () => { s.end(); res(); });
				s.once("error", rej);
			});
			return;
		} catch {
			await new Promise((r) => setTimeout(r, 100));
		}
	}
	throw new Error("server did not start");
});

test.after(() => proc?.kill());

test("register / list / send with acks / presence", async () => {
	const a = client();
	const b = client();

	// register: auto username from pid
	a.send({ type: "register", pid: 1001, cwd: "/tmp/a", task: "task A" }, 1);
	const ra = await a.next();
	assert.equal(ra.rid, 1, "reply echoes rid");
	assert.equal(ra.name, "agent[1001]");

	// register: "all" is rejected and replaced by an auto name
	b.send({ type: "register", pid: 1002, username: "all", cwd: "/tmp/b", task: "task B" }, 2);
	const rb = await b.next();
	assert.equal(rb.rid, 2);
	assert.equal(rb.name, "agent[1002]");
	assert.match(rb.note, /"all" cannot be used as a username/);

	// a is notified that b came online
	const online = await a.next();
	assert.equal(online.type, "presence");
	assert.equal(online.event, "online");
	assert.equal(online.name, "agent[1002]");

	// list shows both users with pid / task / cwd
	a.send({ type: "list" }, 3);
	const list = await a.next();
	assert.equal(list.rid, 3);
	assert.equal(list.users.length, 2);
	assert.deepEqual(
		list.users.map((u) => [u.name, u.pid, u.task, u.cwd]),
		[
			["agent[1001]", 1001, "task A", "/tmp/a"],
			["agent[1002]", 1002, "task B", "/tmp/b"],
		],
	);

	// direct send: reply held until both acks arrive, then released early
	a.send({ type: "send", targets: ["agent[1002]"], text: "hello" }, 4);
	const dm = await b.next();
	assert.equal(dm.type, "message");
	assert.equal(dm.from, "agent[1001]");
	assert.equal(dm.text, "hello");
	assert.equal(typeof dm.mid, "number");
	assert.match(dm.ts, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
	b.send({ type: "ack", mid: dm.mid, stage: "buffered" });
	b.send({ type: "ack", mid: dm.mid, stage: "delivered" });
	assert.deepEqual(await a.next(), { type: "sent", ok: ["agent[1002]"], unread: [], failed: [], rid: 4 });

	// acks from a socket that is not the target (or with an unknown mid) are
	// ignored: only the real target's ack settles the send.
	b.send({ type: "send", targets: ["agent[1001]"], text: "spoof" }, 5);
	const spoof = await a.next(); // the forwarded message
	b.send({ type: "ack", mid: spoof.mid, stage: "delivered" }); // wrong socket: ignored
	a.send({ type: "ack", mid: 999999, stage: "delivered" }); // unknown mid: ignored
	a.send({ type: "ack", mid: spoof.mid, stage: "delivered" }); // the real target
	assert.deepEqual(await b.next(), { type: "sent", ok: ["agent[1001]"], unread: [], failed: [], rid: 5 });

	// unknown target reported as failed immediately (terminal state)
	b.send({ type: "send", targets: ["nobody"], text: "x" }, 6);
	assert.deepEqual(await b.next(), { type: "sent", ok: [], unread: [], failed: ["nobody"], rid: 6 });

	// buffered ack only: sender learns the message is unread when the 5s
	// window closes; a late delivered ack afterwards is ignored.
	a.send({ type: "send", targets: ["agent[1002]"], text: "slow" }, 7);
	const slow = await b.next();
	assert.equal(slow.text, "slow");
	b.send({ type: "ack", mid: slow.mid, stage: "buffered" });
	assert.deepEqual(await a.next(), { type: "sent", ok: [], unread: ["agent[1002]"], failed: [], rid: 7 });
	b.send({ type: "ack", mid: slow.mid, stage: "delivered" }); // late: dropped
	a.send({ type: "list" }, 8);
	assert.equal((await a.next()).rid, 8); // probe: no stray push in between

	// receiver never acks at all: the target counts as failed at the window close
	a.send({ type: "send", targets: ["agent[1002]"], text: "silent" }, 9);
	assert.equal((await b.next()).text, "silent");
	assert.deepEqual(await a.next(), { type: "sent", ok: [], unread: [], failed: ["agent[1002]"], rid: 9 });

	// broadcast: ["all"] must not include the sender; reply waits for acks
	b.send({ type: "send", targets: ["all"], text: "everyone" }, 10);
	const bcast = await a.next();
	assert.equal(bcast.from, "agent[1002]");
	assert.equal(bcast.text, "everyone");
	assert.equal(typeof bcast.mid, "number");
	a.send({ type: "ack", mid: bcast.mid, stage: "delivered" });
	assert.deepEqual(await b.next(), { type: "sent", ok: ["agent[1001]"], unread: [], failed: [], rid: 10 });

	// duplicate username from a different pid is refused
	const c = client();
	c.send({ type: "register", pid: 1003, username: "agent[1001]", cwd: "/tmp/c", task: "task C" }, 11);
	const rc = await c.next();
	assert.equal(rc.rid, 11);
	assert.match(rc.message, /already in use/);
	c.sock.end();

	// disconnect broadcasts offline
	b.sock.end();
	const offline = await a.next();
	assert.equal(offline.type, "presence");
	assert.equal(offline.event, "offline");
	assert.equal(offline.name, "agent[1002]");

	// alone again: broadcast resolves to no targets; explicit self-targeting is
	// its own error; the sender is stripped from mixed lists
	a.send({ type: "send", targets: ["all"], text: "anyone?" }, 12);
	assert.deepEqual(await a.next(), { type: "sent", ok: [], unread: [], failed: [], rid: 12 });
	a.send({ type: "send", targets: ["agent[1001]"], text: "self" }, 13);
	assert.deepEqual(await a.next(), { type: "error", message: "Cannot send a message to yourself.", code: "self", rid: 13 });
	a.send({ type: "send", targets: ["agent[1001]", "ghost"], text: "mixed" }, 14);
	assert.deepEqual(await a.next(), { type: "sent", ok: [], unread: [], failed: ["ghost"], rid: 14 });

	a.sock.end();
});
