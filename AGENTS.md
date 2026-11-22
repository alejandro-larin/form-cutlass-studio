# AGENTS.md

Single-page Next.js 16 (App Router) marketing site: a one-page art-competition submission form.

## Commands
- Install: `pnpm install` (pnpm only; `packageManager` pins pnpm@12.3.4).
- Dev: `pnpm dev` · Build: `pnpm build` · Serve: `pnpm start`.
- No test, lint, or typecheck scripts exist. To typecheck, run `pnpm exec tsc --noEmit`.
- `pnpm build` does NOT catch type errors: `next.config.mjs` sets `typescript.ignoreBuildErrors: true`. Run `tsc --noEmit` explicitly before claiming type safety.

## Structure
- `app/page.tsx` is a thin wrapper; all page UI lives in `components/art-submission-form.tsx` (`'use client'`).
- `@/*` maps to the repo root (not `src/`), per `tsconfig.json`.
- `app/layout.tsx` holds metadata, icons, and Vercel Analytics (production only).

## Styling
- Tailwind v4 with no `tailwind.config.*`; config lives in `app/globals.css` (`@import`, `@theme inline`, `@custom-variant dark`).
- The page is styled primarily with custom CSS classes (`.page-shell`, `.hero`, `.form-card`, ...) defined in `app/globals.css`, not Tailwind utilities. Add/adjust styles there and reuse existing class names.
- Google Fonts are loaded via `@import url(...)` in `app/globals.css`; the `@theme` font vars (`DM Sans`, `Manrope`) must match what is actually imported.
- shadcn config (`components.json`): style `base-nova`, built on `@base-ui/react` — NOT Radix. `components/ui/button.tsx` wraps Base UI's Button.

## Behavior notes
- Submission is client-only: `handleSubmit` just flips a local `submitted` state. There is no API, network call, or persistence; do not assume a backend.
- Upload validation (allowed MIME types, 20 MB cap) lives in `selectFile` in `art-submission-form.tsx`.
- One aria-label is Spanish (`"Quitar archivo"`); UI copy is otherwise English.
