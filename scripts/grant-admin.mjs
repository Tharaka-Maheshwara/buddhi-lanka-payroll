import {initializeApp,applicationDefault} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
const email=process.argv[2],projectId=process.env.GOOGLE_CLOUD_PROJECT;
if(!email||!projectId){console.error('Usage: GOOGLE_CLOUD_PROJECT=<project> npm run admin:grant -- admin@example.com');process.exit(1)}
initializeApp({credential:applicationDefault(),projectId});
const auth=getAuth(),user=await auth.getUserByEmail(email);
await auth.setCustomUserClaims(user.uid,{...user.customClaims,admin:true});
console.log('Administrator permission granted. Sign out and sign in again to refresh the claim.');
