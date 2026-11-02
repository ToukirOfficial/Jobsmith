# Prompts

Versioned prompt files used by the app **and** by the evaluation set in `evals/`, so the evals test exactly
what users run. Each file has a `## System` and a `## User` section; `{{name}}` placeholders are filled in by
`apps/api/src/ai/prompts.ts`.

- Job page text is untrusted: it is always inserted inside `<untrusted_job_posting>` tags (closing tags in
  the text are neutralised) and every system prompt says it is data, never instructions.
- The user's profile is the only source of facts about them. Prompts forbid inventing experience.
- To change a prompt, copy the folder to the next version (`v2/`), edit, run the evals with your own key,
  then switch `PROMPT_VERSION` in `apps/api/src/ai/prompts.ts`.
