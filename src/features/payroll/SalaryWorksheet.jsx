import { useState } from 'react';
import { Field } from '../../shared/ui';
import { money, duration } from '../../shared/utils/format';
import { calculateWorksheet, earlyCompletionBonus, suggestWorksheetDeductions } from './domain/worksheet';

const fields = [
  ['unpaidMinutes', 'Approved basic unpaid minutes', 1],
  ['allowanceDays', 'Meal / travel deduction days', 1],
  ['allowanceMinutes', 'Extra meal / travel deduction minutes', 1],
  ['attendanceDeduction', 'Attendance allowance deduction (LKR)', 0.01],
  ['bonusAdjustment', 'Production bonus adjustment (LKR)', 0.01],
  ['advances', 'Advances (LKR)', 0.01],
  ['otherDeductions', 'Other approved deductions (LKR)', 0.01],
];
const labels = {basic:'Adjusted basic', attendance:'Attendance allowance',
  meal:'Meal allowance', travel:'Travelling allowance', bonus:'Production bonus',
  ot:'Normal OT', double:'Double OT'};

export function SalaryWorksheet({ employee, records, rules }) {
  const [input, setInput] = useState(() => ({
    unpaidMinutes: records.reduce((sum, row) => sum + (row.unpaid || 0), 0),
    allowanceDays: 0, allowanceMinutes: 0, attendanceDeduction: 0,
    bonusAdjustment: 0, advances: 0, otherDeductions: 0,
  }));
  const [approvedLate, setApprovedLate] = useState('');
  const [reviewMessage, setReviewMessage] = useState('');
  const paidDays = records.filter(row => row.status === 'Paid leave').length;
  const noPayDays = records.filter(row => row.status === 'No pay').length;
  function applySuggestion() {
    try {
      if (approvedLate === '') throw new Error('Enter approved late minutes, including zero if applicable.');
      const suggested = suggestWorksheetDeductions(records, rules.hours, Number(approvedLate));
      setInput(previous => ({ ...previous, ...suggested }));
      setReviewMessage('Draft quantities applied. Review other unpaid time and attendance allowance separately.');
    } catch (failure) {
      setReviewMessage(failure.message);
    }
  }
  let result, error;
  try { result = calculateWorksheet(employee, records, rules, input); }
  catch (failure) { error = failure.message; }
  const total = key => records.reduce((sum, row) => sum + (row[key] || 0), 0);
  return <section className="mt-6 border-t border-stone-200 pt-5">
    <h3 className="mb-2 font-semibold">Salary worksheet</h3>
    <p className="mb-4 text-sm">Recorded late time {duration(total('late'))} · OT {duration(total('ot'))} · Double OT {duration(total('double'))}</p>
    <p className="mb-4 text-sm">Enter approved deductions. Basic unpaid minutes start from the attendance register. Meal and travel use a 26-day divisor and the sample worksheet’s rounding.</p>
    <div className="mb-4 rounded-lg border border-stone-200 p-4">
      <p className="mb-2 text-sm">Paid leave {paidDays} days · No pay {noPayDays} days</p>
      <p className="mb-3 text-sm">Enter the approved monthly late total once, including any personal time or early departures counted as lateness. The suggestion replaces the three basic and meal / travel quantities below. Review sick leave and other half unpaid time separately.</p>
      <Field label="Approved monthly late minutes">
        <input type="number" min="0" step="1" value={approvedLate}
          onChange={event => setApprovedLate(event.target.value)} />
      </Field>
      <button type="button" className="mt-3 underline" onClick={applySuggestion}>Apply draft deduction quantities</button>
      {reviewMessage && <p role="status" className="mt-2 text-sm">{reviewMessage}</p>}
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Approved production days saved">
        <select value={input.earlyDays ?? 0} onChange={event =>
          setInput(previous => ({ ...previous, earlyDays: Number(event.target.value) }))}>
          {earlyCompletionBonus.map((amount, days) =>
            <option key={days} value={days}>{days} days · {money(amount)}</option>)}
        </select>
      </Field>
      {fields.map(([key, label, step]) => <Field key={key} label={label}>
        <input type="number" min={key === 'bonusAdjustment' ? undefined : 0}
          step={step} value={input[key]} onChange={event => {
            const value = event.target.value;
            setInput(previous => ({ ...previous, [key]: value === '' ? '' : Number(value) }));
          }} />
      </Field>)}
    </div>
    {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
    {result && <dl className="mt-5">
      {Object.entries(result.earnings).map(([key, amount]) =>
        <div className="flex justify-between border-b border-stone-100 py-2" key={key}>
          <dt>{labels[key]}</dt><dd>{money(amount)}</dd>
        </div>)}
      <div className="flex justify-between py-2"><dt>Gross earnings</dt><dd>{money(result.gross)}</dd></div>
      <div className="flex justify-between py-2 font-semibold"><dt>Draft payable</dt><dd>{money(result.payable)}</dd></div>
    </dl>}
  </section>;
}
