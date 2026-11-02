# 0003 The agent is a fixed sequence of typed steps

**Decision.** The agent is seven fixed steps run by one BullMQ job. Each step's output has a Zod schema and is
saved per step. Sponsor, salary, CV pick and follow-up are plain code; only reading the job and the two drafts
call the AI.

**Why.** Predictable cost and time, outputs that can be checked (an invalid answer is retried once, then shown
as an error), progress the user can watch, and a product that still works without a key. No open-ended tool
use: the agent can't send, submit or fetch anything on its own.

**Prompt injection.** Job text is untrusted. It is wrapped in labelled tags with closing tags neutralised,
every system prompt says it is data only, and outputs are validated (schema, length, banned phrases) before
anything is saved.
