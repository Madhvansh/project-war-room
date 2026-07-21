// WAR ROOM — Firebase web config (CLOUD MODE toggle).
//
// This file decides whether the app runs LOCAL (the zero-dependency Node
// server in ./server.js, data in ./data) or CLOUD (static hosting like
// Netlify + Firebase Auth/Firestore, one record per signed-in user).
//
//   • Placeholder projectId below  → cloud mode OFF → local server as always.
//   • Real Firebase config here     → cloud mode ON → sign-in + Firestore.
//
// These values are NOT secrets. A Firebase web config is meant to ship in the
// browser; your data is protected by Firebase Auth + Firestore SECURITY RULES
// (see firestore.rules), not by hiding this. So it is safe to commit real
// values — or leave the placeholder and inject them at deploy time from
// environment variables (see scripts/netlify-build.mjs and DEPLOY.md).
//
// To fill this in: Firebase console → Project settings → "Your apps" → Web app
// → SDK setup and configuration → "Config". Copy the fields across.

export const firebaseConfig = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID'
};

// Cloud mode is ON only when a real projectId has been filled in. Until then
// every new code path stays dormant and the app behaves exactly as the
// local-first original.
export const cloudEnabled =
  !!firebaseConfig.projectId && firebaseConfig.projectId !== 'YOUR_PROJECT_ID';
