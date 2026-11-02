import {initializeApp} from 'firebase-admin/app';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {calculateDraft,defaultRules} from './calculate.js';
initializeApp();
export const calculatePayrollDraft=onCall({region:'asia-south1',maxInstances:3},async request=>{
 if(!request.auth)throw new HttpsError('unauthenticated','Sign in first.');
 if(request.auth.token.admin!==true)throw new HttpsError('permission-denied','Administrator permission required.');
 const period=request.data?.period;
 if(typeof period!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))throw new HttpsError('invalid-argument','Use YYYY-MM.');
 const db=getFirestore();
 const [employeeSnap,attendanceSnap,settingsSnap]=await Promise.all([
 db.collection('employees').get(),
 db.collection('attendance').where('date','>=',period+'-01').where('date','<=',period+'-31').get(),
 db.doc('settings/payroll').get()]);
 const rules=settingsSnap.exists?settingsSnap.data():defaultRules;
 const attendance=attendanceSnap.docs.map(d=>d.data());
 try {
  const rows=employeeSnap.docs.map(d=>({employeeId:d.id,name:d.data().name,...calculateDraft(d.data(),attendance.filter(r=>r.employee===d.id),rules)}));
  if(rows.length>200)throw new HttpsError('resource-exhausted','This starter supports up to 200 employees per draft.');
  const batch=db.batch();
  for(const row of rows)batch.set(db.doc('drafts/'+period+'_'+row.employeeId),{...row,period,status:'draft',rules:{days:rules.days,hours:rules.hours,ot:rules.ot,double:rules.double},calculatedAt:FieldValue.serverTimestamp(),calculatedBy:request.auth.uid});
  if(rows.length)await batch.commit();
  return {period,employees:rows.length,status:'draft'};
 }catch(error){if(error instanceof HttpsError)throw error;throw new HttpsError('failed-precondition','Review payroll input data and settings.');}
});
