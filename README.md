# Nippon Toyota — Onam Lucky Draw

A Next.js event ceremony with original Three.js geometry, Anime.js choreography, Motion transitions and a standalone Hairline ticket tray. Local Manrope and Source Sans 3 fonts are bundled; no image, font or audio CDN is required. The development wordmark is a placeholder, not approved brand artwork.

## Run locally

Use Node 22+ and npm 10.5+.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The organizer link opens the latest shared event directly, without accounts or sign-in. Upload the participant Excel sheet, review the columns, save and lock the event. Select a branch from the dropdown, then draw its 3rd, 2nd, and 1st prizes. Branches can be completed in any order. There is no sample mode or browser-only winner selection.

## Configure the event

1. Use a dedicated PostgreSQL database or Supabase project, separate from the registration application's database.
2. For a new installation, run `supabase/schema.sql`. For an existing installation, apply `supabase/migrations/20261028_branch_draw.sql` if needed, then `supabase/migrations/20261125_shared_organizer.sql`. The latter makes existing events available to the shared organizer and preserves all results and audit records. Tables have RLS enabled with no browser policies; the server uses a privileged PostgreSQL connection.
3. Copy `.env.example` to `.env.local` and set `DATABASE_URL` to that database (Supabase session pooler port 5432, with provider-required TLS). No Supabase Auth keys or user accounts are needed.
4. Open the page and choose Upload Excel sheet. Upload `.xlsx` or UTF-8 CSV, select a worksheet if needed, map columns and review errors. Required fields: `entry_id`, `name`, `showroom` (branch); optional: `vehicle`, `mobile`. Each branch needs at least three eligible entries. Save reviewed entries and prize descriptions, then lock the event.
5. Keep import requests below 4 MB; the maximum entry count is 50,000. New events draw three prizes per branch. Existing combined-pool events retain their rules.

Everyone with access to the deployed app can manage the shared events. There is no application login or account-based isolation; distribute the organizer URL accordingly.

## Draw audio

Add your recording as `public/draw-music.mp3` on the server before deployment. The page loads it automatically and loops it during the draw and winner reveal. The single speaker button in the header switches sound on or off, including during the ceremony. Sound starts muted; enabling it supplies the browser interaction needed for playback. There is no audio uploader, quality selector, fullscreen control or screenshot mode.

## Ceremony and recovery

Draw in order: 3rd, 2nd, 1st within each branch. Every draw uses only that branch's eligible tickets and must commit before its winner is displayed. A ticket can win once across the event. Continue acknowledges the result; a separate draw click is required for the next prize or branch. The final summary includes all branches. Download winners sheet is available after each reveal and at completion. It exports one `.xlsx` workbook with one Winners worksheet containing all revealed winners, grouped by branch then prize rank: Branch, Prize Rank, Prize, Ticket ID, Name, Vehicle, Mobile, and Draw Time. Ticket IDs and phone numbers remain text. The existing CSV endpoint remains available.

The 10,000 ms reveal deadline starts immediately when Draw is clicked, while the draw request saves the winner. The box spins quickly for three seconds, then smoothly slows through 8.3 seconds, and opens into the gold gift-box scene. The winner appears at the deadline once confirmed by the server; if confirmation takes longer, the screen waits without displaying an assumed result. Browser rendering occurs on the next available frame. Animated ribbons, a floating gold coin, and coin rain surround the winner. The hidden WebGL scene unmounts during the gold reveal. Reduced motion uses a static presentation with the same 10-second wait. Double-click the spinning drum, or use the keyboard-accessible Reveal now button, to reveal the already selected winner immediately. A shortcut still waits for server confirmation and never selects again. Escape or Back to event exits presentation without shortening the deadline. Refresh retains the deadline and committed result.

The Excel uploader skips Excluded rows and blocks unresolved Flagged rows. Headers such as Ticket ID, Name, Phone, Model, and Branch are mapped automatically. Extra columns are not retained. Use the downloadable Excel template for new sheets; legacy `.xls` files must be saved as `.xlsx` first.

Sample data exists only in automated test fixtures. To regenerate those fixtures from `samp.xlsx`, run `python3 scripts/import-sample.py`; they are never loaded by the application.

If a response is lost, retry with the retained idempotency key or use Recover event. Refresh restores the active live event and its committed result. A pending result blocks new draws, including requests from other tabs. The HTML result remains usable if graphics fail. “Replay reveal” starts a new 10-second presentation of the same winner and never selects again. Browser focus and five-second polling synchronize idle live tabs. No redraw or overwrite endpoint exists.

If the network fails before commitment, the app reports an error; do not assume a winner. Recover event when connectivity returns. If WebGL fails, use the HTML result controls. Excel downloads write participant values as literal text; the compatible CSV endpoint retains spreadsheet formula protection.

`POST /api/event` accepts `action`: `create`, `state`, `import`, `lock`, `draw`, `ack`. Requests use the shared organizer on the server and do not require a bearer token. Event operations require `id`; draw also requires UUID `key` and integer `rank`; acknowledge requires `rank`. `GET /api/event?id=...&export=1` exports saved results. Excel/CSV preview and mapping happen locally; the server independently validates every imported entry before saving.

Draws lock the event row in a PostgreSQL transaction and select with Node `crypto.randomInt`. Database constraints enforce one result per rank and per entry. Immutable snapshots include entries and prize descriptions, SHA-256 hashed at lock. Audit records include organizer, timestamp, eligible count and snapshot hash. The 64 displayed folded chits have independent Rapier rigid bodies with friction, gravity, CCD and paper-to-paper contacts. A kinematic six-wall collider follows the box; fixed physics substeps and bounded angular travel keep slow frames from moving walls through paper. This is folded-packet rigid-body simulation, not cloth simulation. Visual physics has no role in selection.

## Verification

```sh
npm test                 # spreadsheets, draw rules, physics, isolated PostgreSQL checks
npm run typecheck
npm run build
# Stop the dev server first; Playwright starts its own on port 3000:
npx playwright test      # browser ceremony, recovery, mobile and direct-link access
```

Browser tests intercept event requests; they do not connect to a real live event. PostgreSQL tests also exercise the API without an authorization header and verify the shared-organizer migration.

The PostgreSQL test starts a temporary local instance on port 55439 using a dev-only package, applies the production schema, and removes the instance afterward. It never connects to Supabase or the registration database. Run as a non-root user.

Browser screenshots go to `test-results/`. The Hairline source is `tickets.js`; the delivered engine and bench are unchanged in `public/hairline-tickets.html`. Open `/hairline-tickets.html?play=1` for the tour: left/center/front tickets, then return to rest. The drawing uses fixed hit targets, distance stagger, a single highlighted edge and sleeping animation loops. Automated frame, console, read-out and settling checks passed; the visual sheet was reviewed. The tour still needs organizer review.

## Deploy and venue acceptance

Import this directory as a Next.js project in Vercel and set `DATABASE_URL`. Deploy the schema or migration before opening the organizer link. Access restrictions, if needed, belong at the hosting layer; the application intentionally has no sign-in.

No cloud resources or deployment have been created by this implementation. Before live launch, provide approved brand artwork, database credentials, `public/draw-music.mp3`, and a validated participant workbook. Check the actual laptop/projector, a separate test event, refresh, concurrent tabs, response loss, audio, keyboard navigation and graphics fallback. Rendering performance depends on venue hardware; quality is selected automatically.

The original scene follows the supplied material direction. Animation API and rendering guidance: [Anime.js timeline](https://animejs.com/documentation/timeline/), [React Three Fiber performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance). Reference images are not shipped.
