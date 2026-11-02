export const defaultRules={days:25,hours:8,ot:1.5,double:2};
export function calculateDraft(employee,records,rules=defaultRules){
 for(const key of ['days','hours','ot','double'])if(!Number.isFinite(rules[key])||rules[key]<=0)throw Error('Calculation rates must be positive.');
 const rate=employee.basic/rules.days/rules.hours,round=n=>Math.round((n+Number.EPSILON)*100)/100;
 const minutes=key=>records.reduce((sum,r)=>sum+(r[key]||0),0);
 const unpaid=round(minutes('unpaid')/60*rate),ot=round(minutes('ot')/60*rate*rules.ot),double=round(minutes('double')/60*rate*rules.double);
 const allowances=round(['attendance','travel','meal','bonus'].reduce((sum,k)=>sum+(employee[k]||0),0));
 return {basic:employee.basic,unpaid,ot,double,allowances,net:round(employee.basic-unpaid+ot+double+allowances)};
}
