# Passoff

Passoff turns website feedback into clear work: reviewers point at the page, the team gets a ready-to-fix issue with evidence, and clients can approve the result.

## Run it

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL, AUTH_SECRET, and what you need
npm run db:migrate
npm run dev                   # http://localhost:3000
```

## Check it

```bash
npm run lint
npm run typecheck
npm test                      # needs TEST_DATABASE_URL (never DATABASE_URL)
npm run build
npm run sdk:measure           # website script size budgets
npm run test:e2e              # Playwright
npm run test:release          # all of the above, in order, with a summary
```

Automated tests only ever use `TEST_DATABASE_URL` and refuse to run against the app database. See
[`docs/RELEASE_AND_OPERATIONS.md`](docs/RELEASE_AND_OPERATIONS.md).

## Where things are documented

| Topic | File |
| --- | --- |
| Product plan | `docs/MVP_PLAN.md` |
| Data model and test database | `docs/DATABASE_MODEL.md` |
| Release, deploy, jobs, monitoring, retention | `docs/RELEASE_AND_OPERATIONS.md` |
| Threat model and security findings | `docs/SECURITY.md` |
| Launch checklist and recommendation | `docs/LAUNCH_CHECKLIST.md` |
| Billing, workspace members, video, usability | `docs/BILLING.md`, `docs/WORKSPACE_MEMBERS.md`, `docs/VIDEO_EVIDENCE.md`, `docs/BEHAVIORAL_INSIGHTS.md` |
| UI rules | `docs/UI_APP_GUIDELINES.md`, `docs/UI_PUBLIC_GUIDELINES.md` |
