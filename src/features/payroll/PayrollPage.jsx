import {useState} from 'react';
import {httpsCallable} from 'firebase/functions';
import {functions} from '../../lib/firebase/client';
import {useRecords} from '../../shared/hooks/useRecords';
import {usePeriod} from '../../app/PeriodContext';
import {demoMode} from '../../config/env';
import {PageHeader,Button,Message} from '../../shared/ui';
import {money} from '../../shared/utils/format';
import {calculateDraft,defaultRules} from './domain/calculate';
export function PayrollPage(){const {period}=usePeriod(),{records:employees}=useRecords('employees'),{records:attendance}=useRecords('attendance'),{records:settings}=useRecords('settings'),[selected,setSelected]=useState(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const rules=settings.find(x=>x.id==='payroll')||defaultRules;
 const rows=employees.map(e=>({employee:e,...calculateDraft(e,attendance.filter(r=>r.employee===e.id&&r.date.startsWith(period)),rules)}));
 const refresh=async()=>{setBusy(true);try{const result=await httpsCallable(functions,'calculatePayrollDraft')({period});setMessage('Server draft saved for '+result.data.employees+' employees.')}catch{setMessage('Server calculation failed. Confirm Functions deployment and administrator permission.')}finally{setBusy(false)}};
 return <><PageHeader title="Monthly payroll" description="Draft estimates using approved minutes. Allowance and statutory rules require confirmation." action={!demoMode&&<Button disabled={busy} onClick={refresh}>Calculate server draft</Button>}/>{message&&<Message>{message}</Message>}
 <div className="card overflow-x-auto"><table><thead><tr>{['Employee','Basic salary','Unpaid','OT','Double OT','Allowances','Estimated net',''].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.employee.id}><td>{r.employee.name}</td>{['basic','unpaid','ot','double','allowances','net'].map(k=><td key={k}>{money(r[k])}</td>)}<td><button onClick={()=>setSelected(r)} className="underline">View</button></td></tr>)}</tbody></table>{!rows.length&&<p>Add employees to start a draft.</p>}</div>
 {selected&&<div className="card mt-6"><div className="mb-6 flex gap-4 border-b border-stone-200 pb-5"><img className="h-16 w-24 object-contain" src="/company-logo.png" alt="Company logo"/><div><h2>BUDDHI LANKA ENGINEERS</h2><p>Draft salary statement · {period}</p></div></div><h2>{selected.employee.name}</h2>{['basic','unpaid','ot','double','allowances','net'].map(k=><div className="flex justify-between border-b border-stone-100 py-3" key={k}><span>{k==='net'?'Estimated net pay':k}</span><b>{money(selected[k])}</b></div>)}<p className="mt-4">Preview only. Advances, statutory deductions, allowance reductions, payroll finalization and payment tracking are the next implementation stage.</p><Button secondary onClick={()=>setSelected(null)}>Close</Button></div>}</>
}
