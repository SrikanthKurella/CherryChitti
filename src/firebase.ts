import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const envConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const isConfiguredValue = (value: unknown): value is string =>
  typeof value === 'string'
  && value.trim().length > 0
  && !/^(your|example|placeholder|replace|todo|<)/i.test(value.trim());

const readSavedConfig = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem('cherry-chits-firebase-config');
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidate = parsed as Record<string, unknown>;
    if (
      isConfiguredValue(candidate.apiKey)
      && isConfiguredValue(candidate.authDomain)
      && isConfiguredValue(candidate.projectId)
      && isConfiguredValue(candidate.appId)
    ) {
      return {
        apiKey: candidate.apiKey.trim(),
        authDomain: candidate.authDomain.trim(),
        projectId: candidate.projectId.trim(),
        appId: candidate.appId.trim(),
      };
    }
  } catch {
    return null;
  }
  return null;
};

const savedConfig = readSavedConfig();
const config = savedConfig || envConfig;
const configEditRequested = typeof window !== 'undefined'
  && window.localStorage.getItem('cherry-chits-edit-firebase-config') === 'true';

export const firebaseConfigured = !configEditRequested
  && Object.values(config).every(isConfiguredValue);

const firebaseApp = firebaseConfigured
  ? getApps()[0] ?? initializeApp(config)
  : null;

export const firebaseAuth = firebaseApp ? getAuth(firebaseApp) : null;
export const firestoreDb = firebaseApp ? getFirestore(firebaseApp) : null;
