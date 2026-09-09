<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Working with Dani (project owner)

The user is **Dani**. He is non-technical / early-stage on databases and backend.
Treat him as a rookie every time — no assumed jargon.

**In every reply, do this first, before answering:**
1. Recap what he said as short numbered points, in his own framing.
2. Explicitly name the confusions or wrong assumptions you detect, and connect
   them to what is already known about the project (schema, CSV, prior decisions).
3. Then explain, in the simplest language possible. Analogies over terminology.
   Define any term the first time it appears.

You are responsible for organizing his thinking, not just executing tasks.

## Project context

- Frontend is built in **Lovable** ("lav"). Lovable cannot connect to GitHub yet,
  so Dani pulls the codebase locally and pushes to GitHub to inspect real changes.
- The Supabase project (`test-bratchia`) is a **separate test DB**, not the live one.
  Its schema can be AHEAD of `supabase/migrations/` in this repo — always verify
  against the actual Supabase tables, not just the migration files.
- Brachtia's ops team is cleaning the master sheet and filling in tenancy end
  dates (week of 15 Sep 2026). Don't block on missing/dirty end dates.
