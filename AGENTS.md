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

## Domain context

Before changing student, booking, billing, maintenance, renewal, or checkout
workflows, read [`LEGACY-OPERATIONS.md`](LEGACY-OPERATIONS.md). It
summarises how Brachtia operated before the website and explains the real-world
handoffs the product is intended to support.

Treat that document as historical discovery context, not a final specification.
Preserve useful operational intent, but do not encode values, responsibilities,
or policies marked as unresolved without confirmation from the business.

## Two databases, and which is which

There are two Supabase projects and they are not interchangeable.

| | Project | What it is for |
| --- | --- | --- |
| `test-bratchia` (`zyuadtrqcgocottxyzpk`) | Dani's own | A sandbox. Prove a change works and behaves as expected before it goes anywhere near the real one. Its data is disposable. |
| Lovable Cloud (`kuknrkeawhjlaepktnfa`) | Lav's, and the live app | The real one. The published site reads and writes here. |

Lovable Cloud does not hand out its service role key - not through settings, not
through the Lovable chat. Code running inside Lovable gets it; nothing outside
does. So `localhost` can never write to the live database, and that is by design
rather than something to work around.

What follows from that:

- **Local work points at `test-bratchia`.** `.env` stays on it. A copy of each
  configuration is kept as `.env.<name>.bak`, and `.env.*` is gitignored.
- **Real data goes in through the published app**, logged in with the admin
  passcode - not from a laptop. The import runs server-side there, where the key
  exists.
- **A migration file in the repo does not run itself.** Every schema change is
  two steps: run it on `test-bratchia`, then send Lav the SQL to paste into
  Lovable's SQL editor (More -> Cloud -> SQL editor). Every one of these goes
  into `docs/PENDING-ON-LOVABLE.md` the moment it is written, and moves to the
  done list once Lav has run it. Code changes do not belong in that file - only
  things the database needs.
- **Write migrations so they can be run twice** - `if not exists`, `add column
  if not exists`. A migration that fails the second time is a migration someone
  will be afraid to run.

As of 11 Sep 2026 Lav's database is fully caught up: all eight Homes and
Residents migrations are applied and the private `resident-documents` bucket
exists.

## Working with Dani

Dani is not a programmer and is learning as the project goes.

**Recap first.** Open a reply by listing his points back as numbered items, name
any confusion in them plainly, connect it to what the project already does, then
explain simply. Never answer before the recap.

**Show him the file, don't lecture.** Point at a specific file, line, or query
and walk through one concrete example. He has said: *"you tell me a lot of
things but just blurt it out and hope me to understand, rather than you trying
to make me understand."* A worked example beats a paragraph.

**Separate fact from opinion.** Say which parts are how the craft works
everywhere and which are a judgment call on this project. He asks for this
directly, and frameworks he can reuse are worth more than conclusions.

**Commits are his alone.** No co-author trailers, no session links, no
generated-with notices. Push unit by unit with messages a non-technical reader
can follow. Never include `AGENTS.md` in a pull request to Lav's repo, and never
reformat her files - keep the diff to the real change.

## Phase docs and quizzes

`docs/` is gitignored and holds the phase write-ups. They record the technical
bugs and their lessons, not only the business decisions - Dani uses them to quiz
himself. Every failure worth learning from gets a line saying what went wrong
and what it teaches.
