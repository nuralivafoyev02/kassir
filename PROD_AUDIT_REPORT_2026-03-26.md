# Production Audit And Fix Report

Date: 2026-03-26
Project: Kassir bot + mini app + worker
Status: Completed

## 1. Project Audit Summary

- Audit scope started with `api/bot.js`, `worker/index.js`, `lib/telegram-ops.cjs`, `public/app.js`, `public/app.features.js`, `api/client-log.js`, `api/notify-miniapp-tx.js`, `api/cron-reminders.js`, `src/App.vue`, `src/lib/loadLegacyScripts.js`.
- Architecture found:
  - `api/bot.js`: Telegram bot webhook, parser, registration, admin panel, category/plan/debt save flows.
  - `worker/index.js`: production worker routes, cron/reminder processing, worker-side logging.
  - `lib/telegram-ops.cjs`: Telegram channel/admin logging and notification helper.
  - `public/app.js` + `public/app.features.js`: mini app runtime, realtime sync, debts/plan/category UX.
  - `api/cron-reminders.js`: legacy local-dev cron path mirroring worker reminder logic.

## 2. Confirmed Problems Found So Far

### P1. Registration gate is tied to user row existence instead of actual registration completeness

- Location:
  - `api/bot.js`
  - `public/app.js`
- Symptom:
  - Mini app auto-creates `users` row.
  - Bot `/start` then treats that person as fully registered even when `phone_number` is still missing.
  - This can skip phone verification and skip admin registration notification.
- Root cause:
  - Bot checks `if (!user)` instead of checking whether the user has a registered phone.

### P1. Bare `Xdan amount` messages fall back to expense

- Location:
  - `api/bot.js`
- Symptom:
  - Example: `dadamdan 50 ming` can become expense.
- Root cause:
  - Current parser only adds strong income weight for limited keyword patterns.
  - When income and expense scores tie, parser defaults to expense.
  - Case suffix semantics like `-dan` and `-ga` are not modeled as first-class signals.

### P1. Person-case tokens leak into category values and fragment reporting

- Location:
  - `api/bot.js`
  - `public/app.features.js`
- Symptom:
  - Inputs like `mirshodga 50 ming`, `mirshoddan 50 ming keldi`, debt settlement flows, and some plan phrases can produce person-shaped categories or person-specific settlement categories.
- Root cause:
  - Category inference uses leftover raw text after amount stripping.
  - Entity normalization is separate from category normalization.
  - Debt settlement category currently embeds person name directly.

### P1. Plan parser can create bad categories from person phrases

- Location:
  - `api/bot.js`
- Symptom:
  - Example: `ozodbek uchun 500 ming limit` can open an expense category based on a person/entity token.
- Root cause:
  - `parsePlanIntent` naively prefers text before `uchun`.
  - `savePlanIntent` auto-creates expense categories for parsed names.
  - No confidence guard exists before category creation.

### P1. Daily reminder/report flow has duplicate-send risk under concurrent cron runs

- Location:
  - `worker/index.js`
  - `api/cron-reminders.js`
- Symptom:
  - Parallel scheduled/manual runs can pick the same user before `last_daily_*` fields are updated.
  - A failure after marking can also suppress retries for the same day.
- Root cause:
  - Reminder rows are fetched in pages but not atomically claimed before send.
  - Claim/release logic exists for debt reminders but not for daily reminders or reports.

### P2. Logging format and transport are not yet aligned with production observability requirements

- Location:
  - `lib/telegram-ops.cjs`
  - `api/bot.js`
  - `worker/index.js`
  - `api/client-log.js`
- Symptom:
  - `/start` logs are emitted as `SUCCESS`, not `INFO`.
  - Mini app client errors are mostly local console only.
  - No dedupe/rate-limit layer exists for repeated identical channel logs.
- Root cause:
  - Logger helper currently focuses on raw chunk delivery, not channel-safe structured policy.

### P2. Mini app startup loads non-critical heavy vendor scripts before first interaction

- Location:
  - `src/lib/loadLegacyScripts.js`
  - `src/App.vue`
- Symptom:
  - Chart/PDF dependencies are loaded during boot although they are only needed later.
- Root cause:
  - All external scripts are loaded serially as critical boot dependencies.

### P2. USD handling stores presentation suffix inside `transactions.category`

- Location:
  - `api/bot.js`
- Symptom:
  - Category values like `Transport ($10)` fragment reports and category-limit matching.
- Root cause:
  - Display note is stored inside the category field instead of staying in response text only.

## 3. Fix Strategy Selected

- Introduce a rule-based semantic parser layer for bot text classification without relying on external AI parsing.
- Separate entity normalization from category normalization.
- Add low-risk confidence gating so ambiguous phrases do not create bad categories.
- Make reminder delivery claim-based to prevent duplicate sends.
- Improve logging helper centrally so bot and worker benefit together.
- Reduce mini app critical-path script loading without changing visible behavior.

## 4. Files Likely To Change

- `api/bot.js`
- `worker/index.js`
- `api/cron-reminders.js`
- `lib/telegram-ops.cjs`
- `api/client-log.js`
- `src/lib/loadLegacyScripts.js`
- `src/App.vue`
- `public/app.js`
- `public/app.features.js`
- New helper/test files if needed

## 7. Implemented Changes

### 7.1 Registration Flow Hardening

- Changed bot registration gate from `user row exists` to `phone number exists`.
- Result:
  - Users created by mini app are no longer treated as fully registered inside the bot.
  - `/start` correctly asks for contact until phone is present.
  - Registration logging/admin notify now happens on real first phone-based registration.
- Files:
  - `api/bot.js`

### 7.2 Rule-Based Semantic Parser Upgrade

- Strengthened transaction parsing with directional semantics:
  - `-dan` treated as source signal.
  - `-ga` treated as target signal.
  - income/expense scoring now uses entity direction, verbs, and semantic hints together.
- Added safer category inference:
  - person/entity tokens no longer leak into transaction categories for transfer-like phrases.
  - `mirshodga 50 ming` now resolves to an expense with generic transfer semantics instead of a person-shaped category.
  - `dadamdan 50 ming` now resolves to income rather than falling back to expense.
- Disabled external AI classification fallback for text parsing and transaction classification after voice transcription.
- Files:
  - `api/bot.js`

### 7.3 Plan Intent Safety Guard

- Added confidence gating for ambiguous plan phrases.
- If the text only names a person/entity and no clear expense semantic exists, the bot now asks for the expense type instead of auto-creating a bad category.
- Example:
  - `ozodbek uchun 500 ming limit` now returns a short clarification prompt.
- Files:
  - `api/bot.js`

### 7.4 Debt Normalization Improvements

- Normalized debt person extraction using directional entities instead of raw suffix leftovers.
- Improved settlement detection for phrases like:
  - `mirshoddan qarzimga 100 ming oldim`
- Removed person names from debt settlement transaction categories to prevent report/category fragmentation.
- Files:
  - `api/bot.js`
  - `public/app.features.js`

### 7.5 Daily Reminder / Daily Report Duplicate Protection

- Added claim/release style send protection for daily reminder and daily report flows.
- Behavior now matches debt reminder safety model more closely:
  - claim user row before send
  - skip if another run already claimed/sent
  - release claim if Telegram send fails
- This reduces:
  - duplicate sends under overlapping cron runs
  - missed retries caused by early marking
- Files:
  - `worker/index.js`
  - `api/cron-reminders.js`

### 7.6 Logging System Upgrade

- Central logger format improved for Telegram channel readability:
  - explicit `status`
  - `module`
  - `action`
  - `time`
  - prettified payload
- Added duplicate suppression window in the logger to reduce repeated channel spam.
- Added request timeout protection for Telegram log delivery.
- Added admin new-user notification sticker support through env-based sticker/file-id/url configuration.
- Corrected `/start` and registration event log levels:
  - `/start` now logs as INFO
  - registration emits INFO + SUCCESS
- Files:
  - `lib/telegram-ops.cjs`
  - `api/bot.js`

### 7.7 Mini App Error Logging And Startup Optimization

- Added non-blocking client error reporting using `sendBeacon` / `keepalive` fetch.
- Routed mini app error logs to worker/server channel logging for ERROR cases.
- Deferred non-critical vendor scripts from initial boot:
  - Chart.js
  - pdfmake
  - pdf fonts
- Added on-demand PDF library loading and lazy chart loading.
- Made mini app transaction notification to bot fire-and-forget so saving a transaction is not blocked by notification delivery.
- Files:
  - `public/app.js`
  - `src/App.vue`
  - `src/lib/loadLegacyScripts.js`
  - `api/client-log.js`
  - `worker/index.js`

### 7.8 Category Consistency Improvements

- Added short-lived user category cache in bot flow to reduce repeated category fetches.
- Prevented frontend category rename/create duplicates using normalized comparison instead of raw lowercase equality only.
- Removed USD display suffix from stored bot transaction category values.
- Files:
  - `api/bot.js`
  - `public/app.features.js`

## 8. Changed Files

- `api/bot.js`
- `api/client-log.js`
- `api/cron-reminders.js`
- `lib/telegram-ops.cjs`
- `public/app.features.js`
- `public/app.js`
- `src/App.vue`
- `src/lib/loadLegacyScripts.js`
- `worker/index.js`
- `tests/bot-parser.test.cjs`
- `PROD_AUDIT_REPORT_2026-03-26.md`
- Build artifacts updated by validation build:
  - `dist/app.js`
  - `dist/app.features.js`
  - `dist/index.html`
  - `dist/assets/index-BwAkl8p3.js`
  - removed old build artifact `dist/assets/index-Cq2DGrGF.js`

## 9. Regression Risk And Mitigation

- Parser changes were kept inside existing intent flow order:
  - debt settlement
  - debt create
  - plan
  - generic transaction
- Reminder changes preserved existing schema compatibility checks and only strengthened send-claim semantics.
- Logging changes are centralized in one helper so bot and worker use the same safe delivery rules.
- Mini app lazy-load only moved non-critical libraries off the critical path; core scripts still boot before app runtime.
- Frontend debt settlement category change was mirrored with bot settlement category change to keep bot/app consistency.

## 10. Validation Executed

- Syntax checks:
  - `node --check api/bot.js`
  - `node --check api/cron-reminders.js`
  - `node --check api/client-log.js`
  - `node --check lib/telegram-ops.cjs`
  - `node --check public/app.js`
  - `node --check public/app.features.js`
  - `node --check worker/index.js`
- Semantic parser tests:
  - `node --test tests/bot-parser.test.cjs`
- Frontend production build:
  - `npm run build`

## 11. Performance Improvements

- Removed blocking Chart/PDF vendor loads from first mini app boot.
- Reduced bot-side repeated category reads with a short TTL cache.
- Removed blocking await on mini app transaction notification back to bot.
- Added logger dedupe + timeout so channel logging is less likely to slow request paths.

## 12. Logging Improvements

- `/start` contact request logged as INFO.
- Real registration logged as INFO + SUCCESS.
- Mini app client-side runtime errors now reach `/api/client-log` and can be forwarded to Telegram channel.
- New-user admin notification format now carries richer structured context.

## 13. Parser / AI-Like Logic Improvements

- Directional semantic scoring added.
- Person/entity normalization improved.
- Category fallback no longer blindly uses leftover person tokens.
- Plan parser now refuses unsafe category auto-creation on ambiguous person-only prompts.
- Debt settlement phrasing coverage improved for repayment-like natural language.

## 14. Daily Reminder Improvements

- Duplicate prevention strengthened with claim/release.
- Failure path now tries to release claim to allow retry.
- Result payloads now track skipped rows from concurrent claims as well.

## 15. Follow-Up Recommendations

- If you want actual sticker delivery for admin registration alerts in production, configure one of:
  - `ADMIN_REGISTRATION_STICKER`
  - `ADMIN_NOTIFY_STICKER_ID`
  - `ADMIN_NOTIFY_STICKER_URL`
- Consider adding a DB-level unique constraint for normalized user category names if you want hard duplicate prevention beyond app-layer checks.
- Consider adding a dedicated `note` or `meta` column for transactions later so presentation-only text never needs to touch `category`.

## 5. Validation Plan

- `/start` with existing user row but missing phone should still request contact.
- Contact-based registration should notify admin/channel with improved format.
- Parser cases to verify:
  - `dadamdan 50 ming`
  - `dadamdan 50 ming oldim`
  - `dadamga 50 ming berdim`
  - `mirshodga 50 ming`
  - `mirshoddan 50 ming keldi`
  - `ozodbek uchun 500 ming limit`
  - `mirshodga qarzga 200 ming berdim`
  - `mirshoddan qarzimga 100 ming oldim`
- Daily reminders/reports should not duplicate under repeated runs.
- Mini app boot should keep working with deferred non-critical assets.

## 6. Notes For Regression Control

- Preserve current DB schema compatibility checks.
- Keep legacy `api/cron-reminders.js` behavior aligned with worker reminder logic.
- Avoid destructive schema assumptions and avoid unsafe migrations.
