# Repository Guidelines

## Project Structure & Modules
- `src/app`: Next.js App Router pages (`page.tsx`, `layout.tsx`).
- `src/components`: Reusable React components (PascalCase files).
- `src/lib`: Client/services, utilities (camelCase files), Supabase client.
- `src/types`: Shared TypeScript types/interfaces.
- `public`: Static assets.
- `__tests__`: Unit tests (Vitest-style).
- `scripts`: Repo scripts (e.g., `check-prod-build.sh`).
- Root `*.sql`: One‑off DB fixes/migrations; run via Supabase SQL editor or psql as coordinated.

## Build, Test, and Development
- `npm run dev`: Start local dev at `http://localhost:3000`.
- `npm run build`: Production build; respects `next.config.ts`.
- `npm run start`: Serve built app.
- `npm run lint`: ESLint (Next core‑web‑vitals + TypeScript).
- `bash scripts/check-prod-build.sh`: Quick CI‑style build + lint.
- Tests: Install Vitest locally, then run: `npm i -D vitest && npx vitest`.
- Optional E2E (if added): `npx playwright test`.

## Coding Style & Naming
- Language: TypeScript + React (Next.js 15, App Router) + Tailwind.
- Indentation: 2 spaces; avoid long lines (>100 chars).
- Components: PascalCase names in `src/components` (e.g., `TeacherExamDashboard.tsx`).
- Pages: lower‑case route folders with `page.tsx`/`layout.tsx`.
- Utils/services: camelCase file names in `src/lib` (e.g., `supabaseClient.ts`).
- Types: PascalCase interfaces/types in `src/types`.
- Linting: Follow ESLint rules; fix warnings before PR.

## Testing Guidelines
- Unit tests live in `__tests__` and end with `.test.ts(x)`.
- Aim for coverage on lib utilities and critical UI logic.
- Include a short test plan in PRs; attach screenshots for UI.

## Commit & Pull Requests
- Commits: concise, imperative (e.g., `fix: exam dropdown state`).
- PRs: clear description, linked issues, before/after screenshots for UI, notes on env or DB scripts touched. Keep scope small and focused.

## Security & Configuration
- `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (never commit).
- `next.config.ts`: Update `images.domains` for your Supabase project.
- Secrets: Use environment vars; scrub logs and screenshots before sharing.
