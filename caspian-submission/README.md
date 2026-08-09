# Deadline Relay

**Caspian Buildathon submission candidate** — a cross-channel urgency and SLA escalation agent for opportunities, compliance deadlines, and high-value business messages.

## Why this exists
A valuable message can arrive in the wrong place at the wrong time. Traditional bots are separate per channel and do not share identity or escalation logic. Deadline Relay uses Caspian as the communication layer so one handler can receive from multiple channels, reply in the correct thread, and proactively escalate urgent items to a second channel.

## Caspian usage
This project is built around the official `caspian-sdk` API:
- `CommClient()` for a single communication identity.
- `@client.on_message` for one handler across every connected channel.
- `message.reply(...)` to answer in the correct channel/thread.
- `client.initiate(connection_id, target, ...)` for proactive cross-channel escalation.
- `client.listen()` for the hosted multi-channel event loop.

The core uses no paid model and no paid channel. Caspian currently documents email, Slack, Discord, and Telegram as free channels.

## Fast live setup
1. `pip install -r requirements.txt`
2. Run `caspian init` to mint the hosted API key and write `.env`.
3. Connect two free channels, for example:
   - `caspian connect email --name "Deadline Relay"`
   - `caspian connect discord --name "Deadline Relay"`
4. Put the second connection ID and target in `ESCALATION_CONNECTION_ID` and `ESCALATION_TARGET`.
5. Start with `python main.py`.

No API keys are committed. If Discord/Slack presents an authorization screen, the account owner completes that one consent action.

## Judge demo
Send a message such as `$10,000 hackathon final deadline in 6 hours`.

Expected behavior:
1. One shared handler parses the incoming message.
2. It detects value, deadline/category and calculates urgency.
3. It replies in the originating channel with a structured summary.
4. High-urgency items are proactively escalated through the second Caspian connection.
5. `ACK`, `SNOOZE 3h`, `ASSIGN Mohammad`, and `IGNORE` update shared state.

## Novelty
The product is not another chatbot UI. It is **cross-channel routing behavior**: high-value events automatically cross communication boundaries while low-value events stay in place. Caspian removes per-channel plumbing, so the routing logic is written once.

## Zero-cost architecture
- Caspian free channels only.
- Deterministic parsing/scoring; no paid LLM dependency.
- Local JSON persistence for the prototype.
- Offline parser tests.

## Test
`python -m unittest discover -s tests`
