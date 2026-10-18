# Chit Manager

A Flutter starter application for a small Indian chit-fund business. Financial amounts are stored as integer paise in Firestore. The first release implements Firebase authentication, owner-private member records, member search/edit/deactivation, payment capture, installment balance transactions, receipts, a dashboard, monthly transaction browsing, and a projected 12-month schedule.

## Cherry Chits website

The live website is hosted at [cherry-chits-business-manager.netlify.app](https://cherry-chits-business-manager.netlify.app/). The responsive React website provides the Cherry Chits dashboard, chit groups, member enrollment/search, member passbooks, payment entry, receipts, transaction history, and contact import. It starts with one empty **Chitti Cherry** group; create additional groups by entering each chit’s total amount and duration, and the monthly installment is calculated from those values. New members can use the group defaults or enter their own chit total, duration, start date, and end date. Member passbooks let the owner mark whether prize money has been lifted and whether the Chitti is completed; saved milestones are shown as tags on member cards.

The website requires Firebase Authentication and Cloud Firestore; it deliberately has no demo-data fallback. Each signed-in account can access only its own `businesses/{uid}` records. Member, group, and payment records are loaded from Firestore in real time. Payments and installment balances are written atomically, and duplicate payment keys are checked transactionally. Chitti groups can be created and permanently deleted. Deleting a member or group removes the corresponding member/group and installment-tracking records, while global payment transactions and receipts remain available in history. These deletes are irreversible.

New-account signup in this source uses a six-digit email OTP delivered by a Firebase callable Cloud Function, then creates and signs in the Firebase account only after successful code verification. Codes expire after 10 minutes, are single-use, allow at most five guesses, and are rate-limited per email and source IP. The production site currently has fingerprint controls deployed, but OTP signup remains unavailable there until the backend below is configured and both the functions and website are deployed.

To connect the website, either enter the Firebase Web app config in the setup screen (saved only in that browser's local storage), or set the same values in `.env.local`:

1. Create a Firebase project and register a Web app in Firebase Console.
2. Enable **Email/Password** in Firebase Authentication and create a Cloud Firestore database.
3. Copy `.env.example` to `.env.local` and fill in the Firebase Web app config values from Project settings, or paste them into the website setup form. These public web config values are not service-account credentials.
4. Publish the current `firestore.rules` to the same Firebase project. The rules grant owner-only access to the `chittis` and `deletedChittis` collections, allow member and installment cleanup, and allow the two member milestone fields to be updated. From the project root, run:

```powershell
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules --project cherry-chits
```

The first command opens Firebase CLI sign-in. Use an account with permission to publish Firestore rules for the project. Re-publish the rules after changing this file. If the site shows **Could not load Chitti groups: Missing or insufficient permissions** or denies group deletion, the deployed rules are outdated or belong to a different Firebase project. Do not use permissive test rules.

To enable numeric signup OTP, the Firebase project must use the **Blaze** plan. Create a Resend account, verify a domain you control in Resend, and create an API key. Do not paste that key into the website, source files, or chat. From the project root, configure the API key using the Firebase CLI's secure prompt:

```powershell
npx firebase-tools functions:secrets:set RESEND_API_KEY --project cherry-chits
```

When Firebase asks for `OTP_SENDER_EMAIL` during deployment, enter a sender address on the verified domain (for example, `Cherry Chits <verify@your-domain.example>`). Then deploy the functions and restrictive Firestore rules:

```powershell
npx firebase-tools deploy --only functions,firestore:rules --project cherry-chits
```

Only after that deployment succeeds, build and deploy the website so signup uses the OTP backend. Function secrets and billing must be configured in the Firebase project used by the website's Firebase Web app; otherwise signup will fail and must not be treated as verified. Consider enabling a Firestore TTL policy for `signupOtpChallenges.expiresAt` to clean expired challenge documents automatically.
5. Run the website from the project root:

```powershell
npm install
npm run dev
```

Restart Vite after changing `.env.local`. If Firebase rejects the API key, use **Firebase config not working? Update config** on the sign-in screen and verify that all four values came from the same registered Web app. To build and preview a production website:

```powershell
npm run build
npm run preview
```

The Netlify project uses `netlify.toml` (`npm run build`, publishing `dist/`, with an SPA fallback). To deploy an update from this project after installing and authenticating the Netlify CLI, run:

```powershell
netlify link
netlify deploy --prod
```

Keep `.env.local` out of Git; it is ignored. The deployed bundle needs the Firebase Web app values at build time, either through `.env.local` or Netlify **Site configuration → Environment variables** using the `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID` names. If those values are not configured for a build, the site opens its Firebase setup form instead of accessing business data.

On Android, the member enrollment form's **Contacts** button opens the system contact picker and fills the selected name and mobile number. The native Android WebView bridge only returns the contact selected by the user; it does not read or sync the contact list in the background. The website also supports **Members → Import contacts** for a user-selected batch; if contact selection is unavailable, import a `.vcf` file.

On supported Android devices, sign in with email and password once, then use **Enable fingerprint** on the signed-in screen to opt in to biometric unlocking. The fingerprint setup card is hidden after enabling it. The Android prompt protects the saved Firebase session on later app launches; **Use email and password** disables biometric unlocking and signs out the saved session. Android back navigation returns to the previous website section before leaving the app. Fingerprint data is handled by Android and is never sent to the website. This is session unlocking, not credential recovery: signing out manually requires a password login before enabling it again. The web site does not expose this control outside the Android app.

New-account signup currently uses Firebase Email/Password directly; numeric email OTP signup is not enabled. A secure numeric OTP requires a trusted server backend and configured transactional email provider, and must not be emulated or verified in browser code. Do not enable public signup with OTP until that backend, expiry/rate limits, and verified sender domain are configured.

The site initializes new accounts with no members or payments. Existing remote Firebase records are not part of this source tree; deletion from the app is explicit and irreversible for member/group records. Global payment transactions are preserved by those delete actions.

## Requirements

- Flutter stable (Dart 3.3 or newer) and Android SDK
- A Firebase project with Cloud Firestore and Firebase Authentication enabled
- FlutterFire CLI

## Configure and run

From the project root in PowerShell:

```powershell
flutter create --platforms=android --org com.example .
flutter pub get
dart pub global activate flutterfire_cli
flutterfire configure
```

In Firebase Console:

1. Add the Android app using the application ID generated by `flutter create`.
2. Enable **Email/Password** and **Phone** sign-in providers. Phone sign-in uses Firebase SMS OTP; Firebase Auth does not offer a secure phone-number-and-password credential.
3. Create a Firestore database and deploy the rules in `firestore.rules` using the Firebase CLI or the Rules editor.
4. Add authorized phone test numbers in Firebase Authentication before testing phone login. Configure SMS regions and billing/quotas before production use.

`flutterfire configure` replaces `lib/firebase_options.dart`. The checked-in file is deliberately a non-secret placeholder and fails explicitly until configured.

Then run:

```powershell
flutter run
```

## Firestore structure

All website business documents are isolated under the authenticated owner's UID:

```text
businesses/{authUid}/members/{memberId}
businesses/{authUid}/members/{memberId}/installments/{YYYY-MM}
businesses/{authUid}/members/{memberId}/paymentKeys/{duplicateKey}
businesses/{authUid}/chittis/{groupId}
businesses/{authUid}/deletedChittis/{groupId}
businesses/{authUid}/payments/{paymentId}
```

Member chit and installment amounts, payment due/received amounts, and payment amounts are integer paise (for example, ₹1,250.50 is `125050`). Each installment allocation atomically checks the member, prevents duplicate entries, increments that installment balance, and writes a payment with a receipt number. When a collection is larger than the selected installment's remaining balance, the extra is automatically allocated to following unpaid installments; each monthly allocation has its own payment-history entry, and the printed collection receipt lists the allocations. Over-collection beyond the member's remaining scheduled Chitti balance is rejected. A payment is recorded only after the collector enters a positive amount received; a transaction reference alone does not mark it collected. Payment records cannot be deleted or changed through the supplied Firestore rules. Member deletion removes that member's nested installment and duplicate-key records; deleting a group also deletes its member records. Neither operation deletes global payment documents. A deleted-group marker keeps deleted default groups from being re-created in the UI and preserves group labels for historical payments.

The website authorization model is one owner per business. Do not grant broader Firestore access or ship permissive development rules. Keep service-account credentials and signing keys out of source control. For production, enable Firebase App Check, configure least-privilege project IAM, restrict account enrollment to the business owner as appropriate, and schedule Firestore managed exports/backups in Google Cloud; the website does not automate backup restore.

## Current feature scope

Website included: email/password registration and sign-in, password reset, dashboard totals, group creation/deletion, member enrollment/search/deletion, payment recording with cash/cheque/online mode, receipt details, payment history, member payment summary, and projected installments.

Not included in this website release: transaction correction with an audit UI, configurable staff roles, CSV/PDF exports, daily/weekly/yearly report filters, notifications/member reminders, or automated backup restore. The Flutter app source is a separate, unverified client and currently uses a different Firestore document schema; it will not sync safely with the website until the schemas are aligned. Do not point both clients at production data yet.

## Build an Android APK

The `android/` project packages the live Cherry Chits website in a small Android WebView app. Its launcher icon uses the supplied dog photo. It requires Android SDK Platform 35 and JDK 17. From PowerShell, with Android SDK tools installed and `ANDROID_HOME` set:

```powershell
cd android
.\gradlew.bat assembleDebug
```

The installable debug APK is written to `android\app\build\outputs\apk\debug\app-debug.apk`. Install the latest APK build to enable native contact selection and fingerprint unlocking; a website refresh alone cannot update native Android features. The app requires an internet connection and loads the hosted site; sign-in and business data continue to use Firebase. It does not contain or synchronize the separate Flutter starter's Firestore schema.

For a signed release APK, configure a private signing key in the Gradle signing configuration before running `.\gradlew.bat assembleRelease`. Never commit signing keys or passwords. For Play Store distribution, produce a signed Android App Bundle instead.
