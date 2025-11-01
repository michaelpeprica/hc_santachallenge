// assets/js/firebase.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyB3rsUPwZrAhSIUhNP5st0NnIoBR9nlpZE",
  authDomain: "santa-challenge.firebaseapp.com",
  projectId: "santa-challenge",
  storageBucket: "santa-challenge.firebasestorage.app",
  messagingSenderId: "499140073635",
  appId: "1:499140073635:web:6c82ed4fb5795b36174716"
};

export const appFB = initializeApp(firebaseConfig);
export const auth = getAuth(appFB);
export const db = getFirestore(appFB);
