# Nippon Toyota — Onam Lucky Draw

A Next.js event ceremony with original Three.js geometry, Anime.js choreography, Motion transitions and a standalone Hairline ticket tray. Local Manrope and Source Sans 3 fonts are bundled; no image, font or audio CDN is required. The development wordmark is a placeholder, not approved brand artwork.

## Run locally

Use Node 22+ and npm 10.5+.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Rehearsal works immediately, uses fictional entries and persists only in the current browser tab. Settings opens organizer preparation. Rehearsal never calls the live draw service. Sound starts muted and is synthesized locally after the operator enables it.

## Configure a private live event

1. Create a **dedicated** Supabase project. Do not use the registration application's database.
2. Run `supabase/schema.sql` in its SQL editor. Tables have RLS enabled with no browser policies. The server uses a privileged PostgreSQL connection; never expose it through a public environment variable.
3. Disable public signups in Supabase Auth. Invite the organizer in the dashboard, complete their password setup, and add their Auth user UUID:

   ```sql
   insert into public.organizers(user_id) values ('INVITED-AUTH-USER-UUID');
   ```

4. Copy `.env.example` to `.env.local`. Set the Supabase URL and anonymous/publishable legacy-compatible key; set `DATABASE_URL` to the dedicated session pooler connection, port 5432, with provider-required TLS. Use the verified provider certificate where required; do not disable certificate verification.
5. Sign in through Settings, create a separate event, upload UTF-8 CSV, map columns and review errors/repeated names. Required fields: `entry_id`, `name`; optional: `showroom`, `vehicle`. Save reviewed entries and prize descriptions, then lock the event.
6. Upload/import requests should remain below Vercel's request-body limit (4.5 MB); the maximum entry count is 50,000. Split/reduce oversized source files before event preparation. Only a single combined pool per event is supported.

Only the event's organizer can access it. Additional organizer accounts create their own events. Inviting a user alone does not grant access until the organizers row exists.

## Ceremony and recovery

Draw in order: 3rd, 2nd, 1st. Each draw commits before animation starts. Continue acknowledges the result, then a separate draw click is required. The draw enters a viewport-filling ceremony. The camera pushes in and arcs around the box during a ten-second spin. The full reveal takes twenty seconds; the last prize has two extra seconds of anticipation. When enabled, sound includes paper rustles, cradle resonance and a reveal chord. At the reveal, an original SVG illustration of reaching hands surrounds a lemon-gold ticket on a mustard background, inspired by the supplied Pinterest reference. A foil sheen crosses the ticket before the committed name, ID and prize appear. The box physics remains unchanged. Manrope stays on names and interface copy; locally hosted Anton supplies condensed display lettering on the ticket. Reduced motion reveals directly. Escape or Back to event returns to the event controls without changing the result.

If a response is lost, retry with the retained idempotency key or use Recover event. Refresh restores the active live event and its committed result. A pending result blocks new draws, including requests from other tabs. “Show saved result” bypasses graphics; “Replay reveal” never selects again. Browser focus and five-second polling synchronize idle live tabs. No redraw or overwrite endpoint exists.

If the network fails before commitment, the app reports an error; do not assume a winner. Recover event when connectivity returns. If WebGL fails, use the HTML result controls. Results can be downloaded as UTF-8 CSV, with spreadsheet formula protection. Screenshot view hides controls; hover/focus the bottom-right exit button to restore them.

`POST /api/event` accepts `action`: `create`, `state`, `import`, `lock`, `draw`, `ack`. All requests require a Supabase bearer access token and organizer membership. Event operations require `id`; draw also requires UUID `key` and integer `rank`; acknowledge requires `rank`. `GET /api/event?id=...&export=1` exports authenticated results. CSV preview/mapping happens locally; the server independently validates every imported entry before saving.

Draws lock the event row in a PostgreSQL transaction and select with Node `crypto.randomInt`. Database constraints enforce one result per rank and per entry. Immutable snapshots include entries and prize descriptions, SHA-256 hashed at lock. Audit records include organizer, timestamp, eligible count and snapshot hash. The 64 displayed folded chits have independent Rapier rigid bodies with friction, gravity, CCD and paper-to-paper contacts. A kinematic six-wall collider follows the box; fixed physics substeps and bounded angular travel keep slow frames from moving walls through paper. This is folded-packet rigid-body simulation, not cloth simulation. Visual physics has no role in selection.

## Verification

```sh
npm test                 # CSV, rehearsal, real isolated PostgreSQL service checks
npm run typecheck
npm run build
# With npm run dev running:
npx playwright test      # browser ceremony, recovery, mobile and unauthorized requests
```

The PostgreSQL test starts a temporary local instance on port 55439 using a dev-only package, applies the production schema, and removes the instance afterward. It never connects to Supabase or the registration database. Run as a non-root user.

Browser screenshots go to `test-results/`. The Hairline source is `tickets.js`; the delivered engine and bench are unchanged in `public/hairline-tickets.html`. Open `/hairline-tickets.html?play=1` for the tour: left/center/front tickets, then return to rest. The drawing uses fixed hit targets, distance stagger, a single highlighted edge and sleeping animation loops. Automated frame, console, read-out and settling checks passed; the visual sheet was reviewed. The tour still needs organizer review.

## Deploy and venue acceptance

Import this directory as a Next.js project in Vercel, set the three environment variables, and enable Vercel Deployment Protection for private access. Auth protects participant data even without hosting protection; noindex alone does **not** make the site private. Set the Supabase site URL and invitation redirect allowlist to the deployment URL. Redeploy after setting public environment variables.

No cloud resources or deployment have been created by this implementation. Before live launch, provide approved brand artwork, hosting/Supabase credentials and a validated participant CSV. Complete a rehearsal on the actual laptop and mirrored projector for 20 minutes. Verify all three live draws using a separate test event, invite-only login, refresh, concurrent tabs, response loss, audio, fullscreen, keyboard navigation and graphics fallback. Target at least 55 fps during animations, approximately 60 fps overall; this is hardware-dependent and has not been measured on the venue equipment. Use Low quality if needed.

The original scene follows the supplied material direction. Animation API and rendering guidance: [Anime.js timeline](https://animejs.com/documentation/timeline/), [React Three Fiber performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance). Reference images are not shipped.
