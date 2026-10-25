import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * Singleton Firebase App initialized strictly from Vite environment variables.
 */
export const app: FirebaseApp =
  getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

/**
 * Singleton Cloud Firestore instance.
 * Supports optional named database via `VITE_FIREBASE_DATABASE_ID` (e.g. Enterprise edition).
 */
export const db: Firestore = import.meta.env.VITE_FIREBASE_DATABASE_ID
  ? getFirestore(app, import.meta.env.VITE_FIREBASE_DATABASE_ID)
  : getFirestore(app);

/**
 * Top-level Firestore collection names.
 */
export const COLLECTIONS = {
  TOURNAMENTS: 'tournaments',
  PAIR_HISTORY: 'pair_history',
  ROSTER: 'roster',
} as const;
