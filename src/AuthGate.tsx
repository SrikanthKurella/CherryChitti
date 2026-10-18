import { useEffect, useState, type FormEvent } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  type User,
} from 'firebase/auth';
import { firebaseAuth, firebaseConfigured } from './firebase';
import ChittiBusinessApp from './App';

const configuredValue = (value: string | undefined) =>
  value && !/^(your|example|placeholder|replace|todo|<)/i.test(value.trim())
    ? value
    : '';

function FirebaseSetupRequired() {
  const [config, setConfig] = useState({
    apiKey: configuredValue(import.meta.env.VITE_FIREBASE_API_KEY),
    authDomain: configuredValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: configuredValue(import.meta.env.VITE_FIREBASE_PROJECT_ID),
    appId: configuredValue(import.meta.env.VITE_FIREBASE_APP_ID),
  });
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const saveConfig = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSaved(false);
    const cleaned = Object.fromEntries(
      Object.entries(config).map(([key, value]) => [key, value.trim()]),
    ) as typeof config;
    if (Object.values(cleaned).some(value => !value || /^(your|example|placeholder|replace|todo|<)/i.test(value))) {
      setError('Replace each sample value with the matching value from your Firebase Web app config.');
      return;
    }
    if (!/^AIza[0-9A-Za-z_-]{30,}$/.test(cleaned.apiKey)) {
      setError('The API key format is invalid. Copy the apiKey value from Firebase Console → Project settings → Your apps.');
      return;
    }
    if (!/^[a-zA-Z0-9.-]+$/.test(cleaned.authDomain) || !/^[a-z0-9-]{5,30}$/.test(cleaned.projectId) || !/^1:\d+:web:.+$/.test(cleaned.appId)) {
      setError('One or more values do not look like Firebase Web app settings. Copy all four values from the same Web app.');
      return;
    }
    try {
      window.localStorage.setItem('cherry-chits-firebase-config', JSON.stringify(cleaned));
      window.localStorage.removeItem('cherry-chits-edit-firebase-config');
      setSaved(true);
      window.location.reload();
    } catch {
      setError('Could not save the Firebase config in this browser. Enable local storage, or configure .env.local instead.');
    }
  };

  const updateConfig = (key: keyof typeof config, value: string) =>
    setConfig(current => ({ ...current, [key]: value }));

  return (
    <main className="min-h-screen bg-slate-50 p-4 sm:p-6 flex items-center justify-center">
      <section className="w-full max-w-xl rounded-2xl bg-white p-5 sm:p-7 shadow-sm border border-slate-200">
        <div className="text-3xl font-black text-emerald-700">₹</div>
        <h1 className="mt-3 text-xl font-bold text-slate-900">Connect Cherry Chits to Firebase</h1>
        <p className="mt-2 text-sm text-slate-600">
          Enter the Web app config from Firebase Console to enable secure sign-in and cloud storage. Member and payment
          records remain unavailable until a valid Firebase project is configured.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">
          <li>Create a Firebase project and register a Web app in Firebase Console.</li>
          <li>Open Project settings → Your apps → SDK setup and configuration → Config.</li>
          <li>Enable Email/Password Authentication, create Firestore, and publish <code>firestore.rules</code>.</li>
        </ol>
        <form onSubmit={saveConfig} className="mt-5 space-y-3">
          {([
            ['apiKey', 'API key'],
            ['authDomain', 'Auth domain'],
            ['projectId', 'Project ID'],
            ['appId', 'App ID'],
          ] as const).map(([key, label]) => (
            <label key={key} className="block text-sm font-semibold text-slate-700">
              {label}
              <input
                type="text"
                autoComplete="off"
                required
                placeholder={{
                  apiKey: 'AIza...',
                  authDomain: 'your-project.firebaseapp.com',
                  projectId: 'your-project-id',
                  appId: '1:123456789:web:abc123',
                }[key]}
                value={config[key]}
                onChange={event => updateConfig(key, event.target.value)}
                className="mt-1 w-full min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
          ))}
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
          {saved && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Config saved. Reloading…</p>}
          <button type="submit" className="w-full rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white hover:bg-emerald-800">
            Save config and connect
          </button>
        </form>
        <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          Firebase web config is public project identification, not an admin secret. Firestore rules and Authentication
          enforce access. Never enter service-account credentials here. Values are saved only in this browser.
        </p>
      </section>
    </main>
  );
}

function AuthScreen({ onEditConfig }: { onEditConfig: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [registering, setRegistering] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWorking(true);
    setError('');
    setNotice('');
    try {
      if (!firebaseAuth) throw new Error('Firebase Authentication is not configured.');
      if (registering) {
        await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password);
      } else {
        await signInWithEmailAndPassword(firebaseAuth, email.trim(), password);
      }
    } catch (authError) {
      const code = typeof authError === 'object' && authError !== null && 'code' in authError
        ? String(authError.code)
        : '';
      setError(code === 'auth/api-key-not-valid'
        ? 'Firebase rejected this API key. Check that apiKey matches the Web app config and that the key is not restricted from this website.'
        : authError instanceof Error ? authError.message : 'Authentication failed.');
    } finally {
      setWorking(false);
    }
  };

  const resetPassword = async () => {
    if (!firebaseAuth || !email.trim()) {
      setError('Enter your email address first.');
      return;
    }
    setError('');
    setNotice('');
    try {
      await sendPasswordResetEmail(firebaseAuth, email.trim());
      setNotice('Password reset email sent.');
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Could not send reset email.');
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-5 flex items-center justify-center">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-100 text-2xl font-black text-emerald-800">₹</div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Cherry Chits</h1>
          <p className="mt-1 text-sm text-slate-500">Secure business sign-in</p>
        </div>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm font-semibold text-slate-700">
            Email address
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700">
            Password
            <input
              type="password"
              required
              minLength={6}
              autoComplete={registering ? 'new-password' : 'current-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 font-normal outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
            />
          </label>
          {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
          {notice && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
          <button
            type="submit"
            disabled={working}
            className="w-full rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {working ? 'Please wait…' : registering ? 'Create secure account' : 'Sign in'}
          </button>
        </form>
        {!registering && (
          <button type="button" onClick={resetPassword} className="mt-2 w-full py-2 text-sm font-semibold text-emerald-800">
            Forgot password?
          </button>
        )}
        <button
          type="button"
          onClick={() => { setRegistering(!registering); setError(''); setNotice(''); }}
          className="mt-2 w-full py-2 text-sm text-slate-600"
        >
          {registering ? 'Already registered? Sign in' : 'Create an account'}
        </button>
        <button type="button" onClick={onEditConfig} className="mt-2 w-full py-2 text-sm font-semibold text-emerald-800">
          Firebase config not working? Update config
        </button>
        <p className="mt-3 text-center text-xs text-slate-500">
          Only authenticated accounts can access their own business records.
        </p>
      </section>
    </main>
  );
}

export default function AuthGate() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const editFirebaseConfig = () => {
    window.localStorage.setItem('cherry-chits-edit-firebase-config', 'true');
    window.location.reload();
  };

  useEffect(() => {
    if (!firebaseAuth) {
      setCheckingAuth(false);
      return;
    }
    return onAuthStateChanged(firebaseAuth, (nextUser) => {
      setUser(nextUser);
      setCheckingAuth(false);
    });
  }, []);

  if (!firebaseConfigured) return <FirebaseSetupRequired />;
  if (checkingAuth) {
    return <main className="min-h-screen grid place-items-center bg-slate-50"><span className="text-emerald-800">Loading secure session…</span></main>;
  }
  return user ? <ChittiBusinessApp /> : <AuthScreen onEditConfig={editFirebaseConfig} />;
}
