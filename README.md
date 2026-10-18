# Chit Manager

A Flutter starter application for a small Indian chit-fund business. Financial amounts are stored as integer paise in Firestore. The first release implements Firebase authentication, owner-private member records, member search/edit/deactivation, payment capture, installment balance transactions, receipts, a dashboard, monthly transaction browsing, and a projected 12-month schedule.

## Cherry Chits website

The live website is hosted at [cherry-chits-business-manager.netlify.app](https://cherry-chits-business-manager.netlify.app/). The responsive React website provides the Cherry Chits dashboard, chit groups, member enrollment/search, member passbooks, payment entry, receipts, transaction history, and contact import. It starts with one empty **Chitti Cherry** group; create additional groups by entering each chit’s total amount and duration, and the monthly installment is calculated from those values. New members can use the group defaults or enter their own chit total, duration, start date, and end date. Member passbooks let the owner mark whether prize money has been lifted and whether the Chitti is completed; saved milestones are shown as tags on member cards.

The website requires Firebase Authentication and Cloud Firestore; it deliberately has no demo-data fallback. Each signed-in account can access only its own `businesses/{uid}` records. Member, group, and payment records are loaded from Firestore in real time. Payments and installment balances are written atomically, and duplicate payment keys are checked transactionally. Chitti groups can be created and permanently deleted. Deleting a member or group removes the corresponding member/group and installment-tracking records, while global payment transactions and receipts remain available in history. These deletes are irreversible.

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

On Android, open the deployed HTTPS website in Chrome and choose **Members → Import contacts**. The browser only shares contacts selected by the user. If native contact selection is unavailable, import a `.vcf` file. This is not background contact synchronization.

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

Member chit and installment amounts, payment due/received amounts, and payment amounts are integer paise (for example, ₹1,250.50 is `125050`). Payment capture atomically checks the member, prevents duplicate entries, increments the installment balance, and writes a payment with a receipt number. Over-collection is rejected. A payment is recorded only after the collector enters a positive amount received; a transaction reference alone does not mark it collected. Payment records cannot be deleted or changed through the supplied Firestore rules. Member deletion removes that member's nested installment and duplicate-key records; deleting a group also deletes its member records. Neither operation deletes global payment documents. A deleted-group marker keeps deleted default groups from being re-created in the UI and preserves group labels for historical payments.

The website authorization model is one owner per business. Do not grant broader Firestore access or ship permissive development rules. Keep service-account credentials and signing keys out of source control. For production, enable Firebase App Check, configure least-privilege project IAM, restrict account enrollment to the business owner as appropriate, and schedule Firestore managed exports/backups in Google Cloud; the website does not automate backup restore.

## Current feature scope

Website included: email/password registration and sign-in, password reset, dashboard totals, group creation/deletion, member enrollment/search/deletion, payment recording with cash/cheque/online mode, receipt details, payment history, member payment summary, and projected installments.

Not included in this website release: transaction correction with an audit UI, configurable staff roles, CSV/PDF exports, daily/weekly/yearly report filters, notifications/member reminders, or automated backup restore. The Flutter app source is a separate, unverified client and currently uses a different Firestore document schema; it will not sync safely with the website until the schemas are aligned. Do not point both clients at production data yet.

## Build an Android APK

For a locally installable debug APK:

```powershell
flutter build apk --debug
```

For a release APK, create a private upload key, configure `android/key.properties` and the Android Gradle signing config locally, then run:

```powershell
flutter build apk --release
```

Never commit the signing key or `key.properties`. For Play Store distribution, prefer a signed app bundle with `flutter build appbundle --release`.
