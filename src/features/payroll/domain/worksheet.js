import { calculateDraft } from './calculate.js';

export function suggestWorksheetDeductions(records, hours, approvedLateMinutes) {
  if (!Number.isSafeInteger(approvedLateMinutes) || approvedLateMinutes < 0) {
    throw new Error('Enter approved late time as whole minutes.');
  }
  const dayMinutes = hours * 60;
  const paidDays = records.filter(row => row.status === 'Paid leave').length;
  const noPayDays = records.filter(row => row.status === 'No pay').length;
  const lateAfterLeave = Math.max(0, approvedLateMinutes - Math.max(0, 2 - paidDays) * dayMinutes);
  const noPayMinutes = records.filter(row => row.status === 'No pay')
    .reduce((sum, row) => sum + (row.unpaid || 0), 0);
  return {
    unpaidMinutes: noPayMinutes + lateAfterLeave,
    allowanceDays: paidDays + noPayDays + Math.floor(approvedLateMinutes / dayMinutes),
    allowanceMinutes: approvedLateMinutes % dayMinutes,
  };
}

export const earlyCompletionBonus = [0, 2000, 3000, 4000, 6000];

export function calculateWorksheet(employee, records, rules, input) {
  const { unpaidMinutes, allowanceDays, allowanceMinutes,
    attendanceDeduction, bonusAdjustment, advances, otherDeductions, earlyDays = 0 } = input;
  if (![unpaidMinutes, allowanceDays, allowanceMinutes].every(
    value => Number.isSafeInteger(value) && value >= 0
  ) || ![attendanceDeduction, advances, otherDeductions].every(
    value => Number.isFinite(value) && value >= 0
  ) || !Number.isFinite(bonusAdjustment) || !Object.hasOwn(earlyCompletionBonus, earlyDays)) {
    throw new Error('Enter valid approved quantities and amounts.');
  }
  const round = value => Math.round(value * 100) / 100;
  const prorate = amount => {
    const daily = amount / 26;
    const hours = Math.floor(allowanceMinutes / 60);
    const minutes = allowanceMinutes % 60;
    const tenth = value => Math.round(value * 10) / 10;
    return round(amount - tenth(daily * allowanceDays)
      - tenth(daily * hours / rules.hours)
      - tenth(daily * minutes / (rules.hours * 60)));
  };
  const draft = calculateDraft(employee, [
    ...records.map(record => ({ ...record, unpaid: 0 })),
    { unpaid: unpaidMinutes },
  ], rules);
  const earnings = {
    basic: round(draft.basic - draft.unpaid),
    attendance: round((employee.attendance || 0) - attendanceDeduction),
    meal: prorate(employee.meal || 0),
    travel: prorate(employee.travel || 0),
    bonus: round((employee.bonus || 0) + bonusAdjustment + earlyCompletionBonus[earlyDays]),
    ot: draft.ot,
    double: draft.double,
  };
  if (Object.values(earnings).some(value => value < 0)) {
    throw new Error('An approved deduction exceeds its earnings component.');
  }
  const gross = round(Object.values(earnings).reduce((sum, value) => sum + value, 0));
  return { earnings, gross, payable: round(gross - advances - otherDeductions) };
}
