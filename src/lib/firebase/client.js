import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
import { firebaseConfig,firebaseReady,demoMode,functionsRegion } from '../../config/env';
const app=firebaseReady&&!demoMode?initializeApp(firebaseConfig):null;
export const auth=app?getAuth(app):null;
export const db=app?getFirestore(app):null;
export const functions=app?getFunctions(app,functionsRegion):null;
