# AGENTS.md

Single-page Next.js 16 (App Router) art-competition site. Submissions upload to Google Drive.

## Commands
- Use pnpm only (`packageManager` pins `pnpm@12.3.4`): `pnpm install`, `pnpm dev`, `pnpm build`, `pnpm start`.
- No test or lint scripts. Typecheck with `pnpm exec tsc --noEmit`.
- `pnpm build` skips type errors (`typescript.ignoreBuildErrors`), so always run `tsc --noEmit` explicitly.
- Google Drive OAuth: `pnpm google:auth` (reads `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` from `.env`/`.env.local`).

## Architecture
- All page UI and GSAP live in `components/art-submission-form.tsx` (`'use client'`); `app/page.tsx` is a wrapper. `@/*` maps to the repo root.
- Four panels. With `(min-width: 768px) and (min-height: 560px) and (prefers-reduced-motion: no-preference)` GSAP pins and scrolls horizontally; otherwise the layout is vertical. Keep the matchMedia queries and `PANEL_COUNT` in sync when changing panels.
- Most styling is custom CSS in `app/globals.css`, not Tailwind utilities. Tailwind v4 has no config file; theme lives in `globals.css`. shadcn uses `base-nova` on `@base-ui/react`, not Radix.
- Fonts are imported as `Bowlby One SC` + `Nunito`; the `@theme` vars still say `DM Sans`/`Manrope`, so do not rely on `--font-sans`/`--font-display`.
- UI copy is English; `aria-label="Quitar archivo"` is intentionally Spanish.

## Drive submission
- Flow: client validates with Zod → `POST /api/drive/session` creates a resumable session → client sends 2 MB chunks to `POST /api/drive/upload`. Google Drive is the only persistence.
- Vercel's payload limit is why uploads are chunked. Keep chunks ≤ 2 MB and non-final chunks multiples of 256 KB; never send the whole 20 MB file through one route. Both API routes must stay on the Node runtime.
- `lib/validation.ts` is shared client/server (name, terms, MIME types, 20 MB cap). Server revalidates, and the first chunk is magic-byte checked. Drive file name: `Name - logo - YYYY-MM-DD.ext`.
- Drive auth is an OAuth refresh token with full `drive` scope, not a service account. The session URL is stored in an HttpOnly cookie; `lib/google-drive.ts` uses raw REST + `fetch` (no `googleapis` dependency).
- Server-only env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_DRIVE_FOLDER_ID` (see `.env.example`). OAuth "Testing" mode refresh tokens expire after 7 days. Never print or commit `.env*` or `client-secret.json`.
