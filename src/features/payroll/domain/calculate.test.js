import {describe,it,expect} from 'vitest';
import {calculateDraft,defaultRules} from './calculate';
import {calculateDraft as serverCalculate} from '../../../../functions/src/calculate';
const employee={basic:30000,attendance:0,travel:0,meal:0,bonus:0};
describe('draft payroll calculation',()=>{
 it('converts hours and minutes correctly',()=>expect(calculateDraft(employee,[{ot:991}],defaultRules).ot).toBe(3716.25));
 it('deducts half no pay once',()=>expect(calculateDraft(employee,[{unpaid:90,late:90}],defaultRules).net).toBe(29775));
 it('adds double pay separately',()=>expect(calculateDraft(employee,[{double:510}],defaultRules).double).toBe(2550));
 it('does not assume missing attendance is no pay',()=>expect(calculateDraft(employee,[],defaultRules).net).toBe(30000));
 it('rejects zero divisors',()=>expect(()=>calculateDraft(employee,[],{...defaultRules,days:0})).toThrow());
 it('uses identical client and server draft formulas',()=>{const records=[{ot:991,double:120,unpaid:95}];expect(serverCalculate(employee,records,defaultRules)).toEqual(calculateDraft(employee,records,defaultRules))});
});
