# Architecture

This is the first implementation milestone, not a completed production payroll system.

## Application boundaries

- app: routing, authenticated shell, period state and layout.
- features: domain-specific pages and business calculations.
- shared: reusable UI, formatting and record subscription hook.
- lib/firebase: Firebase SDK initialization only.
- config: public build-time configuration.
- data: clearly separate demo records.
- functions: deployable trusted server code.
- firebase: database security and indexes.
- scripts: privileged administrator setup, never included in the browser bundle.

The server recalculates drafts from Firestore. It never accepts a client-calculated salary as authoritative. Final payroll/payment operations are deliberately not exposed in this milestone.

## Authentication and authorization

Email/password sign-in identifies users. An admin custom claim permits reading and updating operational records in Security Rules. Authenticated users without that claim cannot enter the workspace or read payroll records. There is no client registration screen. Create approved accounts in the Firebase console, then grant the custom claim using a trusted administrator environment.

The local demo can be enabled by anyone running their own copy; it contains only sample data and does not bypass Firestore permissions. Production deployments must use VITE_DEMO_MODE=false.

## Data model

employees/{employeeId}: profile, basic, attendance, travel, meal, bonus.
attendance/{entryId}: employee reference, date, clock times, personal leave, approved durations.
settings/payroll: days, hours, OT and double-pay multipliers.
drafts/{period_employeeId}: server-calculated draft totals, rule snapshot, actor and timestamp.

Durations use integer minutes. Display uses HH:MM. Currency is rounded to two decimals for draft results; exact payroll rounding policy must still be confirmed.

## Known limits and next milestones

- Salary profiles are current values; effective-date history is not implemented.
- Drafts are estimates. No finalized payroll, advances ledger, payment records or PDF/export workflows yet.
- A single personal leave interval is supported per day.
- Shift and leave clock spans are calculated; late/regular/OT/unpaid durations require approval.
- Attendance duplicate detection is a client guard, not a database uniqueness guarantee. Add deterministic employee/date document IDs or transactions before multi-admin use.
- Security rules deny deletions and direct draft writes.
- Firebase security rules and deployed Functions need emulator/integration tests against the chosen project before operational use.
- Add audit history, automated backups and recovery procedures before live payroll.
- Hosted ChatGPT prototype records are not automatically migrated to this project.
