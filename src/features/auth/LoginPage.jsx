import { useState } from 'react';
import { signInWithEmailAndPassword,sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../lib/firebase/client';
import { firebaseReady } from '../../config/env';
import { Button,Field } from '../../shared/ui';
export function LoginPage(){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const run=async reset=>{setBusy(true);setMessage('');try{if(reset){await sendPasswordResetEmail(auth,email);setMessage('If this account is registered, a reset email will be sent.')}else await signInWithEmailAndPassword(auth,email,password)}catch{setMessage('Unable to complete this request. Check your details and try again.')}finally{setBusy(false)}};
 return <main className="grid min-h-screen place-items-center p-5"><form className="card w-full max-w-md space-y-5" onSubmit={e=>{e.preventDefault();run(false)}}>
 <img src="/company-logo.png" alt="Buddhi Lanka Engineers" className="h-20 w-32 object-contain"/><div><p className="eyebrow">BUDDHI LANKA ENGINEERS</p><h1>Administrator login</h1><p>Sign in to manage attendance and payroll.</p></div>
 {!firebaseReady&&<p role="alert" className="notice">Firebase is not configured. Copy .env.example to .env and complete the setup in README.md.</p>}
 <Field label="Email"><input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></Field><Field label="Password"><input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></Field>
 {message&&<p role="status">{message}</p>}<Button disabled={!auth||busy}>{busy?'Please wait…':'Sign in'}</Button><button type="button" className="block text-sm underline" disabled={!auth||busy||!email} onClick={()=>run(true)}>Reset password</button></form></main>
}
