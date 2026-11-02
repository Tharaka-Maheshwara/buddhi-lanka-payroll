# Buddhi Lanka Engineers Payroll

React, Firebase and Tailwind starter using the approved dark-green payroll design and restored company logo.

## Included in this milestone

- Responsive sidebar and dashboard.
- Employee add/edit forms and attendance add/edit register.
- Arrival/departure, personal leave Out/In, automatic leave duration and clock validation.
- Approved regular, late, OT, double OT and unpaid minute inputs.
- Draft salary preview and calculation settings.
- Email/password login and administrator claim checks.
- Firestore subscriptions and writes, database Security Rules.
- Callable server draft calculation and administrator provisioning script.
- Explicit local demo mode, unit tests and Firebase Hosting configuration.

This starter does not yet include the prototype's advance adjustments, CSV/PDF exports, payroll finalization, effective salary history or payment ledger. See docs/ARCHITECTURE.md for the next milestones. No Firebase project has been created or deployed by this deliverable.

## 1 Start locally

Use Node.js 22.12 or newer. Extract the ZIP and open a terminal in this folder.

    npm ci

Copy .env.example to .env. On Windows PowerShell:

    Copy-Item .env.example .env

On macOS/Linux:

    cp .env.example .env

Keep VITE_DEMO_MODE=true for the first design review.

    npm run dev

Open the localhost URL printed by Vite. Demo mode stores sample data in this browser. It has no real login and no company records. Do not use it for live payroll.

## 2 Connect Firebase

1. Create a Firebase project and register a Web app.
2. Enable Authentication > Email/Password.
3. Create Cloud Firestore in production mode.
4. Copy the Web app configuration values into .env.
5. Set VITE_DEMO_MODE=false and restart Vite.
6. Deploy the supplied Firestore rules before entering real data.
7. Create the administrator user in Firebase Authentication. There is no public sign-up screen.
8. Grant the admin claim using the privileged script below.
9. Sign in through the app. Users without the admin claim remain blocked.

Firebase Web configuration is public application configuration. Never place service account credentials or private keys in VITE_ variables, public/, or source control.

## 3 Grant administrator permission

Run this only from a trusted workstation with authorized Application Default Credentials or GOOGLE_APPLICATION_CREDENTIALS pointing to a service-account file stored outside this project.

PowerShell:

    $env:GOOGLE_CLOUD_PROJECT="your-project-id"
    npm run admin:grant -- admin@example.com

macOS/Linux:

    GOOGLE_CLOUD_PROJECT=your-project-id npm run admin:grant -- admin@example.com

The target email must already exist in Firebase Authentication. Sign out and sign in after changing claims. Access is enforced by Firestore rules and callable function checks, not just hidden buttons.

## 4 Test and build

    npm test
    npm run build
    npm run preview

## 5 Deploy

Install Firebase CLI using the official Firebase documentation, then:

    firebase login
    firebase use --add
    firebase deploy --only firestore:rules,firestore:indexes

Select your actual project in the CLI. No project ID is hardcoded in this package.

For server draft calculation, install the function dependencies:

    npm --prefix functions ci
    firebase deploy --only functions

The callable function uses asia-south1; keep VITE_FIREBASE_FUNCTIONS_REGION consistent if you change that region. Cloud Functions deployment requires an eligible billing plan; check the current Firebase requirements before enabling it.

For hosting, set VITE_DEMO_MODE=false, fill in your project values and rebuild:

    npm run build
    firebase deploy --only hosting

Do not deploy an old demo-mode build. .env values are read at build time.

## Folder structure

    src/
      app/                 Routes, layout and selected payroll period
      config/              Public environment configuration
      data/                Sample records for demo mode
      features/
        auth/              Login and administrator session
        dashboard/         Overview
        employees/         Employee management
        attendance/        Register and time calculations
        payroll/           Salary previews and draft logic
        settings/          Calculation rules
      lib/firebase/        SDK clients
      shared/
        hooks/             Reusable Firestore/demo access
        ui/                Shared controls
        utils/             Currency and time formatting
      styles/              Tailwind entry point
    public/                Company logo
    firebase/              Security Rules and indexes
    functions/src/         Trusted callable Functions
    scripts/               Privileged administrator setup
    docs/                  Architecture and milestone scope

## Official references

- https://vite.dev/guide/
- https://tailwindcss.com/docs/installation/using-vite
- https://firebase.google.com/docs/web/setup
- https://firebase.google.com/docs/auth/web/start
- https://firebase.google.com/docs/auth/admin/custom-claims
- https://firebase.google.com/docs/functions/callable
- https://firebase.google.com/docs/hosting/quickstart
