# agent-chat
## An ultra-lightweight plugin for Pi that enables automatic inter-agent communication across multiple instances.

The core implementation consists of only two files and has no additional dependencies.

* * *

### Purpose

When multiple agents work concurrently, this plugin enables them to communicate with each other, significantly reducing the likelihood of issues such as resource contention, race conditions, and inefficient troubleshooting.

Example: Suppose you are working on a website project where the backend is deployed using containers. You have opened multiple worktrees, each running its own Pi instance, allowing them to independently implement and test features on their respective branches.

**Without the plugin:**  
Agent1 starts testing first by bringing up the backend with `docker compose up`. While Agent1 is testing, Agent2 prepares to begin its own tests. Since Agent2 is unaware of Agent1’s presence, it stops the containers and rebuilds them with its own changes. Agent1 then encounters anomalies and wonders why the containers suddenly stopped. It begins various (often ineffective) troubleshooting steps, then kills the containers started by Agent2 and starts its own. This leads to confusion between the two agents. The more parallel agents there are, the more chaotic the situation becomes. If you instruct agents to avoid testing to prevent such conflicts, overall efficiency drops.

**With the plugin:**  
Agent1 and Agent2 will automatically communicate with each other, informing one another of their intentions. Through negotiation, they coordinate their testing workflows, enabling both to complete their tasks fully automatically without manual intervention.

### Usage

#### Requirements
- `@earendil-works/pi-coding-agent`

No additional dependencies!

#### Steps

1. Clone the project onto your machine.

```bash
# The following example assumes cloning into the home directory, which is also the case in this demo. Otherwise, minor additional configuration is needed (see below).
cd
git clone https://github.com/Hysilens-Helektra/agent-chat.git
ln -s ~/agent-chat/agent-chat.ts ~/.pi/agent/extensions/agent-chat.ts    # This example links to Pi's global config (recommended). You can also configure it at the project level.
```

2. (Optional) Start the server manually.

```bash
node ~/agent-chat/server.mjs
```

If you don’t start the server manually, the first Pi agent will start it automatically upon registration.

The advantage of starting the server manually is that you can monitor the agents’ communication messages via screen output on the server side.

Only one server instance can be running per machine at a time.

3. Launch Pi.

Start Pi wherever you prefer. You can launch multiple Pi instances concurrently to effectively test the plugin’s capabilities.

You can tell each agent: “Test the agent-chat tool” to experience its functionality.

After that, you can proceed with normal usage!

#### Recommendation

Add or modify the following in `~/.pi/agent/settings.json`:

```json
{
  "steeringMode": "all"
}
```

This allows the backlog message queue to be flushed/sent all at once.

#### Optional Environment Variables

If you prefer not to clone into `$HOME`, or want to customize the port:

- `AGENT_CHAT_PORT`: Specify a port number. Both the server and the client (Pi) must have access to this variable. If you use the automatic server startup method, the server inherits the environment variables from Pi.
- `AGENT_CHAT_SERVER`: Specify the directory where your server files are located. Only required if you’re using automatic server startup and the server is not in the default location. Only the client (Pi) needs to have access to this variable.

### Tips

After an agent loads this tool, it does not automatically know to use it for conflict avoidance. Therefore, we recommend explicitly describing the tool’s usage in your prompts to the agent. Here’s a rough example of a prompt:  
(Note: A complete prompt/SKILL example will be provided in the future. For now, you can use this version or adapt it freely.)

```text
In the project you are working on, other agents may be running concurrently on different worktrees. Since certain project resources are shared, conflicts and contention may arise during simultaneous development and testing. To avoid this, you must first register with agent_chat and communicate with other agents to prevent conflicts. When communicating with other agents, use clear, direct, and concise language to express your intentions. Avoid ambiguous language, rhetorical devices, filler words, and polite pleasantries. Communicate only when necessary. Be aware that if the target agent is currently executing a tool call, it will not receive your message immediately; the message will be delivered after the target agent’s current tool call completes (via Steering). You may choose to pause and wait or continue working as needed, but only pause when necessary.
```

* * *

About this documentation: It is currently incomplete and will be updated in the future.
