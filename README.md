# Nippon Toyota — Onam Lucky Draw

A Next.js event ceremony with original Three.js geometry, Anime.js choreography, Motion transitions and a standalone Hairline ticket tray. Local Manrope and Source Sans 3 fonts are bundled; no image, font or audio CDN is required. The header and favicon use the Toyota emblem with its original proportions.

## Run locally

Use Node 22+ and npm 10.5+.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The homepage opens the draw drum directly, without accounts or sign-in. In Settings, upload the participant Excel sheet, review the entries, and choose Upload sheet. This saves and locks the event. Select a branch from the dropdown, then draw its 3rd, 2nd, and 1st prizes. Branches can be completed in any order.

## Configure the event

1. Use a dedicated PostgreSQL database or Supabase project, separate from the registration application's database.
2. For a new installation, run `supabase/schema.sql`. For an existing installation, apply `supabase/migrations/20261028_branch_draw.sql` if needed, then `supabase/migrations/20261125_shared_organizer.sql`. The latter makes existing events available to the shared organizer and preserves all results and audit records. Tables have RLS enabled with no browser policies; the server uses a privileged PostgreSQL connection.
3. Copy `.env.example` to `.env.local` and set `DATABASE_URL` to that database (Supabase session pooler port 5432, with provider-required TLS). No Supabase Auth keys or user accounts are needed.
4. Open Settings and upload `.xlsx` or UTF-8 CSV. The supplied format is `Ticket ID, Name, Phone, Model, Colour, VIN, Flagged, Excluded, Created At, Branch`. Ticket ID, Name and Branch are required; Phone and Model populate the winner details. Each uploaded branch needs at least three eligible entries. Review the preview, then choose Upload sheet.
5. Keep import requests below 4 MB; the maximum entry count is 50,000. New events draw three prizes per branch. Existing combined-pool events retain their rules.

Everyone with access to the deployed app can manage the shared events. There is no application login or account-based isolation; distribute the organizer URL accordingly.

## Draw audio

`public/draw-music.mp3` contains the approximately ten-second sound from the [supplied video](https://www.youtube.com/shorts/73lExmmuuGQ). Sound is enabled by default and starts once the selected winner is saved. It plays once; the winner appears when playback ends and the server has confirmed the saved result. Muting keeps the playback clock running. Replay restarts the same sound and winner presentation. Reveal now and double-click skip to the final 1.2 seconds of sound, revealing the saved winner at the closing cue. Missing or unavailable audio uses the ten-second fallback.

## Ceremony and recovery

Draw in order: 3rd, 2nd, 1st within each branch. Every draw uses only that branch's eligible tickets and must commit before its winner is displayed. A ticket can win once across the event. Continue acknowledges the result; a separate draw click is required for the next prize or branch. The final summary includes all branches. Download winners sheet is available after each reveal and at completion. It exports one `.xlsx` workbook with one Winners worksheet containing all revealed winners, grouped by branch then prize rank: Branch, Prize Rank, Prize, Ticket ID, Name, Vehicle, Mobile, and Draw Time. Ticket IDs and phone numbers remain text. The existing CSV endpoint remains available.

The reveal duration follows the audio metadata, and the drum animation follows the media playback position. The server saves the winner when Draw is clicked; the sound and animation start after confirmation, and playback completion controls when the winner becomes visible. If the audio stalls, the drum and reveal wait. Reduced motion uses a static presentation with the same audio timing. Double-click the spinning drum, or use Reveal now, to skip to the sound’s final reveal cue for the already selected winner. A shortcut still waits for server confirmation and never selects again. Escape or Back to event exits presentation without shortening playback. Refresh retains the deadline and committed result and resumes the remaining audio when the browser allows playback.

The fixed-format uploader maps columns automatically, shows byte-transfer progress and the entry count, then waits for database confirmation. Saving and locking happen in one transaction (`import` with `finalize: true`); retries of the same saved snapshot are safe. Connections stay open between prizes, and idle state polling does not lock event rows.

The Excel uploader skips Excluded rows and blocks unresolved Flagged rows. Extra columns are not retained. The 13 branches are Enjakkal, Irinjalakuda, Kalamaserry, Kayamkulam, Kazhakootam, Kollam, Kottayam, Muvattupuzha, Nettoor, Pala, Pathanamthitta, Thiruvalla and Trichur. Case, surrounding whitespace and known spelling variants are normalized; unknown branch names are rejected. Missing branches appear as disabled “No participants” options and are listed in the upload review. `samp (1).xlsx` contains 43 participants across four branches, so the other nine remain unavailable. The downloadable template matches its columns and provides three blank participant rows per branch; fill these with real entries before uploading.

Sample data exists only in automated test fixtures. To regenerate those fixtures from `samp.xlsx`, run `python3 scripts/import-sample.py`; they are never loaded by the application.

If a response is lost, retry with the retained idempotency key or use Recover event. Refresh restores the active live event and its committed result. A pending result blocks new draws, including requests from other tabs. The HTML result remains usable if graphics fail. Replay presents the same winner and never selects again. Browser focus and five-second polling synchronize idle live tabs. No redraw or overwrite endpoint exists.

If the network fails before commitment, the app reports an error; do not assume a winner. Recover event when connectivity returns. If WebGL fails, use the HTML result controls. Excel downloads write participant values as literal text; the compatible CSV endpoint retains spreadsheet formula protection.

`POST /api/event` accepts `action`: `create`, `state`, `import`, `lock`, `draw`, `ack`. Requests use the shared organizer on the server and do not require a bearer token. Event operations require `id`; draw also requires UUID `key` and integer `rank`; acknowledge requires `rank`. `GET /api/event?id=...&export=1` exports saved results. Excel/CSV preview and automatic column mapping happen locally; the server independently validates every imported entry before saving.

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

The app connects to the configured PostgreSQL database; it has not been deployed. Before live launch, upload a validated participant workbook. Check the actual laptop/projector, a separate test event, refresh, concurrent tabs, response loss, audio, keyboard navigation and graphics fallback. Rendering performance depends on venue hardware; quality is selected automatically.

The original scene follows the supplied material direction. Animation API and rendering guidance: [Anime.js timeline](https://animejs.com/documentation/timeline/), [React Three Fiber performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance). Reference images are not shipped.
