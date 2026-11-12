import { cert, initializeApp } from "firebase-admin";
import { readFileSync } from 'node:fs';

// ECS injects this JSON from Secrets Manager; local development keeps its existing file.
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON)
  : JSON.parse(readFileSync(new URL('../serviceAccountKey.json', import.meta.url), 'utf8'));

export const app=initializeApp({
  credential: cert(serviceAccount)
});
