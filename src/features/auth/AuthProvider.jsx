import { createContext,useContext,useEffect,useState } from 'react';
import { onIdTokenChanged,getIdTokenResult,signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase/client';
import { demoMode } from '../../config/env';
const Context=createContext(null);
export function AuthProvider({children}){
 const [session,setSession]=useState({user:null,admin:false,loading:!!auth});
 useEffect(()=>{if(!auth)return;let generation=0;const unsub=onIdTokenChanged(auth,async user=>{
 const current=++generation;setSession({user:null,admin:false,loading:true});
 if(!user){setSession({user:null,admin:false,loading:false});return}
 try{const token=await getIdTokenResult(user);if(current===generation)setSession({user,admin:token.claims.admin===true,loading:false})}
 catch{if(current===generation)setSession({user:null,admin:false,loading:false})}
 });return()=>{generation++;unsub()}},[]);
 return <Context.Provider value={{...session,demo:demoMode,logout:()=>auth?signOut(auth):Promise.resolve()}}>{children}</Context.Provider>;
}
export const useAuth=()=>useContext(Context);
