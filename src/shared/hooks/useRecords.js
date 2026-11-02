import {useEffect,useState} from 'react';
import {collection,onSnapshot,setDoc,doc,serverTimestamp} from 'firebase/firestore';
import {db} from '../../lib/firebase/client';
import {demoMode} from '../../config/env';
import {demoRecords} from '../../data/demo';
const prefix='buddhi-payroll-react-v1-';
const readDemo=name=>{try{return JSON.parse(localStorage.getItem(prefix+name))||demoRecords[name]||[]}catch{return demoRecords[name]||[]}};
export function useRecords(name){
 const [records,setRecords]=useState(()=>demoMode?readDemo(name):[]),[loading,setLoading]=useState(!demoMode),[error,setError]=useState('');
 useEffect(()=>{if(demoMode){const sync=()=>setRecords(readDemo(name));window.addEventListener('payroll-data',sync);return()=>window.removeEventListener('payroll-data',sync)}
 if(!db){setError('Firebase configuration is missing.');setLoading(false);return}
 return onSnapshot(collection(db,name),snap=>{setRecords(snap.docs.map(d=>({...d.data(),id:d.id})));setLoading(false);setError('')},()=>{setError('Unable to read records. Check administrator permission and Firebase setup.');setLoading(false)});
 },[name]);
 async function saveRecord(data){const id=data.id||(demoMode?'demo-'+Date.now()+'-'+Math.random().toString(36).slice(2):doc(collection(db,name)).id);const record={...data,id};
 if(demoMode){const next=[...readDemo(name).filter(x=>x.id!==id),record];localStorage.setItem(prefix+name,JSON.stringify(next));window.dispatchEvent(new Event('payroll-data'))}
 else{if(!db)throw Error('Firebase is not configured.');await setDoc(doc(db,name,id),{...record,updatedAt:serverTimestamp()})}
 return id;
 }
 return {records,loading,error,saveRecord};
}
