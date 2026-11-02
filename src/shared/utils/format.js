export const money=value=>new Intl.NumberFormat('en-LK',{style:'currency',currency:'LKR'}).format(value||0);
export const duration=value=>Math.floor((value||0)/60).toString().padStart(2,'0')+':'+((value||0)%60).toString().padStart(2,'0');
