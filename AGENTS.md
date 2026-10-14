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

## Rules live in src/lib, once

Before writing a business rule on a screen (can this room be sold as a
single, is this booking paid, which dates clash), search `src/lib/` for the one
that already exists and call it. If two screens need a rule, it moves to
`src/lib/` first. Room selling is `roomOffer` in `src/lib/room-offer.ts`, and
`tests/one-rule.test.ts` fails when a screen adds its own copy. See
`docs/MISTAKES-TO-AVOID.md` 3b.

## Shared pieces - reuse, never rebuild

A new feature that needs one of these calls it, passing what differs as
props or arguments. Copying it is how Update Tenancy came to reserve rooms
its own way and the checkout statement got its own invoice table. Full list,
and what is still duplicated: `docs/HANDOFF-REUSE.md`.

| Need | Use | Guarded by |
| --- | --- | --- |
| Lines of any money document (invoice, credit note, statement) | `LineItemsEditor` (`src/components/admin/LineItemsEditor.tsx`) | `tests/one-rule.test.ts` |
| Preview a PDF before it is issued | `PdfPreviewButton` (`src/components/admin/PdfPreview.tsx`) | - |
| How a room can be sold | `roomOffer` (`src/lib/room-offer.ts`) | `tests/one-rule.test.ts` |
| Reserve a bed for a booking | `placeStay` -> SQL `place_stay` (`placement_holds`) | `tests/placement*.test.ts` |
| Checkout statement sums, credit note vs invoice | `checkoutTotals`, `checkoutDocKind` (`src/lib/checkout-types.ts`) | `tests/checkout-type.test.ts` |
| Payment methods and what each needs | `METHOD_RULES`, `ruleFor` (`src/lib/payment-methods.ts`) | `tests/payment-methods.test.ts` |
| Shrink a photo before upload | `compressImage` (`src/lib/compress.ts`) | - |
| Money on a document | `formatRM` (with sen). `money` in ops-store rounds to the ringgit - lists only | - |
| A list's stages as clickable counts (filters the table) | `StageStrip` (`src/components/admin/StageStrip.tsx`) - pass the same stage list and pill colours the table uses | - |
| A quiet line of news on a card (stays, or closes with ✕ and is remembered) | `Notice`, `DismissibleNotice`, `NOTICE_CLASS` (`src/components/ui/notice.tsx`) | `tests/one-rule.test.ts` |
| A credit note's PDF look (checkout statement, room-change credit note) | `creditNoteFrame`, `creditNotePdf` (`src/lib/credit-note-pdf.ts`) | - |
| Describe a placement (single / twin, bed) - as sold, not as built | `soldOccupancy`, `soldBedLabel` (`src/lib/placement.ts`); documents read `bedSurroundings` (`placement.server.ts`) | `tests/placement.test.ts` |
| Money in a tenancy document (no amount is 0.00) | `money` (`src/lib/template-fields.ts`) | `tests/template-money.test.ts` |

## Domain context

Before changing student, booking, billing, maintenance, renewal, or checkout
workflows, read [`LEGACY-OPERATIONS.md`](LEGACY-OPERATIONS.md). It
summarises how Brachtia operated before the website and explains the real-world
handoffs the product is intended to support.

Treat that document as historical discovery context, not a final specification.
Preserve useful operational intent, but do not encode values, responsibilities,
or policies marked as unresolved without confirmation from the business.

Before changing tenancy-agreement templates, document previews, DOCX-to-PDF
conversion, resident signing, PDF forms, or signed-file storage, read
[`docs/DOCUMENT-RENDERING-DECISION.md`](docs/DOCUMENT-RENDERING-DECISION.md),
then the fuller history in
[`docs/HANDOFF-TENANCY-AGREEMENT.md`](docs/HANDOFF-TENANCY-AGREEMENT.md).
The current direction is hybrid: flexible tenancy documents remain Word
templates and use Gotenberg/LibreOffice for deployed conversion; fixed forms
such as the Access Card Form remain PDFs filled through mapped boxes.

Before deployment, environment, Git remote, billing or infrastructure work,
read [`docs/ENVIRONMENT-AND-DEPLOYMENT-MAP.md`](docs/ENVIRONMENT-AND-DEPLOYMENT-MAP.md).
Dani's Vercel, `test-bratchia` Supabase, personal GitHub workflow and personal
Google Cloud project are a proof-of-concept environment, not the client-facing
Lovable environment. Never infer the target GitHub remote and never make the
live application permanently depend on Dani's personal billing account.
For the personal document-converter walkthrough, read
[`docs/GOTENBERG-CLOUD-RUN-POC.md`](docs/GOTENBERG-CLOUD-RUN-POC.md).

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
