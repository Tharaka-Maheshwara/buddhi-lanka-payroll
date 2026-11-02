export function calculateClock({inTime,outTime,leaveOut,leaveIn,overnight=false,breakMinutes=0}){
 const minute=t=>{if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(t||''))throw Error('Enter valid 24-hour times.');return Number(t.slice(0,2))*60+Number(t.slice(3))};
 if(!Number.isInteger(breakMinutes)||breakMinutes<0)throw Error('Breaks must be whole positive minutes.');
 if(Boolean(leaveOut)!==Boolean(leaveIn))throw Error('Enter both personal leave times.');
 const start=minute(inTime),end=minute(outTime)+(overnight?1440:0);
 if(end<=start||end-start>1440)throw Error('Check Out time and the next-day option.');
 let leave=0;if(leaveOut){let a=minute(leaveOut),b=minute(leaveIn);if(overnight){if(a<start)a+=1440;if(b<start)b+=1440}if(b<=a||a<start||b>end)throw Error('Personal leave must fall within the shift.');leave=b-a}
 const worked=end-start-leave-breakMinutes;if(worked<0)throw Error('Leave and breaks exceed the shift.');
 return {leave,worked};
}
export function validateDurations(record){for(const key of ['regular','late','unpaid','ot','double'])if(!Number.isInteger(record[key])||record[key]<0||record[key]>1440)throw Error('Use whole minutes between 0 and 1440.');if(record.regular+record.ot+record.double>1440)throw Error('Worked time exceeds 24 hours.');}
