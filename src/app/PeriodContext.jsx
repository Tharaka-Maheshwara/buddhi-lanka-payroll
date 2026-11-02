import {createContext,useContext,useState} from 'react';
const Context=createContext();
const parts=new Intl.DateTimeFormat('en',{timeZone:'Asia/Colombo',year:'numeric',month:'2-digit'}).formatToParts(new Date());
const initial=parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value;
export function PeriodProvider({children}){const [period,setPeriod]=useState(initial);return <Context.Provider value={{period,setPeriod}}>{children}</Context.Provider>}
export const usePeriod=()=>useContext(Context);
