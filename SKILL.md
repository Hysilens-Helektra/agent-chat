---
name: multi-agent
description: Use the agent-chat tool group to communicate with other agents to avoid conflicts or to coordinate work when operating on the same machine. Use this when the user requests it or when you encounter errors that do not appear to be caused by your own actions.
---
Other agents may be running concurrently with you.
Because agents share the same machine, certain resources and states may be shared or exclusive, including but not limited to backend containers, ports, databases, development servers, processes, files outside the worktree, and external services. Git worktrees isolate repository files but not these resources.
Your goal is not to follow a fixed workflow or obtain permission from a central coordinator. Instead, maintain awareness of other agents and communicate with them when doing so can avoid conflicts or improve overall progress efficiency.

### Initialization
- When this skill is loaded, register with `agent_chat` so that other agents can discover you.
- After registering, check for relevant agents.
- Registration and online status are broadcast automatically. Do not send a message solely to announce that you are online.

### When to Communicate
Communicate when any of the following conditions apply:
- You are about to perform an operation that may affect a resource or state that other agents may be using.
- Your next step may conflict with the intent, plan, or current activity of another agent.
- You encounter an anomaly or unexpected error, and a quick investigation suggests it may have been caused by another agent.
- Collaboration or negotiation is more efficient than silent waiting.
- You have inadvertently disrupted another agent's work.
- Due to an unexpected event, a previously agreed-upon arrangement must be changed.
- You are holding an exclusive resource but realize you still have substantial work to do during which another agent could use it.
- You are releasing a resource for which you previously agreed to announce availability.
- An emergency or other situation requires immediate coordination.
- The user explicitly requests communication or coordination in another situation.
Do not communicate for routine progress that does not affect other agents.

### Before Operations on Shared or Potentially Shared Resources
Before starting, stopping, restarting, rebuilding, migrating, or otherwise modifying a shared or potentially shared resource:
1. Where possible, check the currently active agents and their reported activities.
2. Determine whether your operation may interfere with them.
3. If a conflict is possible, communicate and negotiate a compatible approach before proceeding.
Consider adjusting your approach rather than waiting unnecessarily. For example, if doing so allows both agents to proceed, consider using an alternative port, isolated containers, a separate database, or another compatible resource. However, if the overhead or cost of creating an isolated environment that enables concurrent work is too high, do not force the creation of another environment.

### Language Style Requirements
- Express intent clearly, directly, and concisely.
- Provide sufficient context so that other agents can understand without ambiguity.
- Avoid ambiguous language, rhetorical devices, filler words, and polite pleasantries.
- Communicate only when necessary.
- Once both parties understand and have reached an agreement on the arrangement, stop sending messages unless the situation changes.
- End a conversation by simply stopping further messages, rather than with thanks or pleasantries.

### Negotiation Principles
- Treat other agents as peers, not subordinates.
- Do not assume that another agent must stop working for you.
- Do not assume that a shared resource must be exclusively held if it can be safely shared.
- Prefer mutually compatible solutions over rigid locking.
- When a conflict arises, assess whether initiating negotiation or modifying your own approach yields higher overall efficiency.
- Re-negotiate when circumstances change.
The goal is to maximize overall task efficiency in a multi-agent concurrent work environment while maintaining mutual awareness and resource safety.

### Things to Be Aware Of
If the target agent is currently running and using a tool, your message may not be delivered until that tool call completes; treat this as normal steering behavior.
If another agent is already aware of the situation and you are waiting for their response, do not resend the same message.

### When You Must Wait
If you cannot safely and efficiently proceed without a resource that another agent is currently using:
- First, notify the other agent and ask them to notify you when the resource becomes available.
- Continue with other useful work that does not depend on that resource.
- If there is no remaining useful work and you must wait, end the current turn (end-of-sequence) and return control to the agent framework.
  - Agent-Chat will proactively wake you when another agent sends a message or when an online status change occurs.
  - Before EOS-ing to wait for a resource, you must first inform the target agent to notify you when the resource becomes available, because after EOS your resumption of execution is entirely dependent on external events.
- Do not use `sleep` or Bash polling to wait for another agent; this is inefficient: short intervals waste context, while long intervals result in idle waiting.
Resume when the target resource becomes available.
