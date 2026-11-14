# Templates and packs

A **pack** is one small JSON file that holds routines, trackers and goals someone already worked out. The Templates
window (Plan › Routines › Browse templates, or You › Settings) shows what a pack would add, lets you untick any of it, and
saves nothing until you press Add. Undo takes back exactly what that one import made.

The format is `relife.pack` version 1, defined and validated in `packages/contract/src/packs.ts`
(`parsePack`). Setup's starter packs (`apps/web/src/packs/*.json`) use the same format and the same code.

## Where a pack comes from

| Source | How it is opened |
| --- | --- |
| Starter packs | Built in. |
| A file | Chosen on your machine and read in the browser. |
| A link | An `https` address on `raw.githubusercontent.com` or `gist.githubusercontent.com` (or this app's own address), fetched **by your browser** (never by the server), only after you press Open link. A GitHub page link (`github.com/…/blob/…`) is turned into its raw file. Any other host is refused with a hint to download the file and choose it. Up to 64 KB. The preview shows where the pack came from. |
| Community packs | The list in `community/packs/` of this repository, fetched from GitHub only after you press Show community packs. |

`/plan/routines?templates=1&pack=<https link>` opens the window with the link filled in. It does not fetch it.

## What adding a pack does

- A routine, tracker or goal you already have (same name, slug or title) is skipped. Adding a pack twice adds nothing.
- A tracker you have without a target gets the pack's target; a target you set is never changed.
- Items in an area you turned off are left out, unless you let the preview turn the area on.
- A goal needs a free goal slot (you can have 3 active), a tracker or routine to link, and passes the same checks as a
  goal you write yourself (no medical or body outcomes; health goals are about steps). A goal that is left out says why.
- A goal starts from a baseline: your own recorded last 28 days when there are enough, otherwise a number you type.
- Everything it creates is an ordinary routine, tracker or goal you can edit. Nothing is a subscription to the pack.

## Share my setup

Pick routines, trackers and goals; the file holds only those. It carries no entries, values, baselines, dates, ids,
medicines, money or connection data. Routine notes and goal reasons are left out unless you tick the box. The file is
checked with the same schema before it downloads, so it opens again as it is.

## Submitting a community pack

1. Add `community/packs/<id>.json` (the file name is the pack's `id`: lowercase letters, digits and dashes).
2. Add its entry to `community/packs/index.json` (same `name`, `description`, `author` and `areas`).
3. Run `npm test`. The tests parse every file, compare it with the index and apply the review rules below.
4. Open a pull request.

Review rules (the tests enforce the first four):

- No links, addresses or `@handles` in any text, and no `homepage`.
- No amounts of money, in any currency, and no money trackers (the format has none).
- A medicine routine says only "As prescribed" for its dose. Prefer a plain routine ("Take morning tablet").
- No `targets` (those belong to setup).
- Nothing that diagnoses, promises a result or asks a person to push through pain.
- Names and notes are short, plain and written for the person who adds it. Text is shown as plain text, never as HTML.
- Do not include a person's name, a place or anything private to you.
