# Agent-Chat
**Let independent Pi agents talk to each other.**
When you run multiple Pi sessions in parallel—often from separate Git worktrees, or possibly different repositories—they share more than just a codebase. They may also share Docker containers, development servers, ports, databases, caches, and other resources. Git can isolate the files, but it cannot make the agents aware of one another.
`Agent-Chat` adds a lightweight peer-to-peer communication layer for Pi. Each running agent can discover other agents on the same machine, see who is active, and send messages directly into their Pi sessions. **You can start a Pi instance at any time to have it join the work. Agent-Chat allows dynamic mid-session join and leave, without needing to start all instances upfront and write all prompts before beginning work in one go.**
* * *
# agent-chat
### Features
#### Not an orchestrator
`Agent-Chat` intentionally does **not** try to manage your agents.
There is no primary agent, no subagent hierarchy, no task scheduler, no predefined workflow, and no mandatory locking model. The agents remain independent peers and decide for themselves when they need to communicate, what information matters, and how to resolve conflicts.
The idea is simple:
> **Give agents a way to talk, then let the agents coordinate.**
The core implementation is only two files and has no additional dependencies. It is meant to be a small communication primitive that can be added to independently running Pi sessions without introducing another orchestration framework.
This opens up many possibilities.
#### Push-based message delivery
Messages are delivered via persistent connections in a push manner; agents do not need to poll their inbox.
### Effect
When multiple agents work concurrently, this plugin enables them to communicate with each other, significantly reducing the likelihood of issues such as resource contention, race conditions, and inefficient troubleshooting.
**Example:** Suppose you are working on a website project where the backend is deployed using containers. You have opened multiple worktrees, each running its own Pi instance, allowing them to independently implement and test features on their respective branches.

**Without the plugin:**
Agent1 starts testing first by bringing up the backend with `docker compose up`. While Agent1 is testing, Agent2 prepares to begin its own tests. Since Agent2 is unaware of Agent1's presence, it stops the containers and rebuilds them with its own changes. Agent1 then encounters anomalies and wonders why the containers suddenly stopped. It begins various (often ineffective) troubleshooting steps, then kills the containers started by Agent2 and starts its own. This leads to confusion between the two agents. The more parallel agents there are, the more chaotic the situation becomes. You will need to manually intervene to avoid this issue—whether by telling agents the execution order, testing manually yourself, or simply allowing only one agent to work at a time—any of which will consume your time.

**With the plugin:**
You come up with a feature and start Pi instance 1. While instance 1 is still working, you think of another requirement. At this point, you can simply start Pi instance 2 as usual and assign and start the task. Agent1 and Agent2 will automatically communicate with each other, informing one another of their intentions. Through their exchange, they autonomously coordinate the use of shared resources, enabling both to complete their respective tasks fully automatically, without manual intervention in the vast majority of cases.
* * *
### Installation and Usage

#### Requirements
- `@earendil-works/pi-coding-agent`
- No additional dependencies!

#### Steps
1. Clone the project onto your machine.
```bash
# The following example assumes cloning into the home directory (~), which is also the case in this demo. Otherwise, minor additional configuration is needed (see below).
cd
git clone https://github.com/Hysilens-Helektra/agent-chat.git
ln -s ~/agent-chat/agent-chat.ts ~/.pi/agent/extensions/agent-chat.ts    # This example links to Pi's global config (recommended). You can also configure it at the project level.
mkdir -p ~/.agents/skills/multi-agent/
ln -s ~/agent-chat/SKILL.md ~/.agents/skills/multi-agent/SKILL.md
```
optional:
```bash
echo 'alias acs="node ~/agent-chat/server.mjs"' >> ~/.bashrc
source ~/.bashrc
```

2. (Optional) Start the server manually.
```bash
acs
# or
node ~/agent-chat/server.mjs
```
If you don't start the server manually, the first registered Pi agent will start it automatically.
The advantage of starting the server manually is that you can monitor the agents' communication messages via screen output on the server side.
Only one server instance can be running per machine at a time.

3. Launch Pi.
Start Pi wherever you prefer. You can launch multiple Pi instances concurrently to effectively test the plugin's capabilities.
You can tell each agent: "Test the agent-chat tool" to experience its functionality.
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
- `AGENT_CHAT_SERVER`: Specify the directory where your server files are located. Only required if you're using automatic server startup and the server is not in the default location. Only the client (Pi) needs to have access to this variable.

### Tips

After an agent loads this tool, it does not automatically know to use it for conflict avoidance. Therefore, when starting a task, you should type `/multi-agent` or something similar to make the agent load the skill. You can also write the requirement to load this skill into your system prompt, so you won't need to type it manually every time.

If you prefer not to use SKILL, you can also use a simple prompt:
```text
In the project you are working on, other agents may be running concurrently on different worktrees. Since certain project resources are shared, conflicts and contention may arise during simultaneous development and testing. To avoid this, you must first register with agent_chat and communicate with other agents to prevent conflicts. When communicating with other agents, use clear, direct, and concise language to express your intentions. Avoid ambiguous language, rhetorical devices, filler words, and polite pleasantries. Communicate only when necessary. Be aware that if the target agent is currently executing a tool call, it will not receive your message immediately; the message will be delivered after the target agent's current tool call completes (via Steering). You may choose to pause and wait or continue working as needed, but only pause when necessary.
```
However, SKILL.md generally yields better results.
* * *
Of course, `agent-chat` is merely a communication layer and is not restricted to resolving resource contention. You are free to explore more possibilities.
