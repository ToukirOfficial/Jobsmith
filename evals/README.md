# Agent evaluation set

Fictional job adverts and a fictional candidate, run through the **same prompt files** the app uses
(`prompts/`), with checks on each answer. Run it by hand with your own key; it never runs in CI and the
unit tests never call a real AI.

```bash
EVAL_PROVIDER=GEMINI EVAL_API_KEY=your-key pnpm evals
# optional: EVAL_MODEL=gemini-2.5-flash  EVAL_BASE_URL=http://localhost:11434/v1 (OPENAI_COMPATIBLE)
```

Each case checks that:
- the answer is valid JSON and passes the same Zod schema as the agent step,
- no banned clichés appear ("passionate", "keen interest", …),
- the letter names the company and uses at least one real fact from the profile,
- nothing from the "forbidden" list appears (invented employers, or text an injected instruction asked for),
- read-job finds the must-have skills.

The runner prints a pass/fail table and exits non-zero if any check fails.
