import { useState } from "react";

import { useRecords } from "../../shared/hooks/useRecords";
import { usePeriod } from "../../app/PeriodContext";

import {
  Button,
  Field,
  Message,
  PageHeader,
} from "../../shared/ui";

import { Modal } from "../../shared/ui/Modal";
import { money, duration } from "../../shared/utils/format";

import { calculateSalary } from "./domain/salary";
import { DownloadPaysheet } from "./DownloadPaysheet";

const earningFields = [
  ["basic", "Basic after deductions"],
  ["attendance", "Attendance allowance"],
  ["travel", "Travelling allowance"],
  ["meal", "Meal allowance"],
  ["bonus", "Production bonus"],
  ["ot", "OT payment"],
  ["double", "Double OT payment"],
];

function AmountRow({
  label,
  value,
  deduction = false,
  bold = false,
}) {
  return (
    <div
      className={`flex justify-between gap-4 border-b border-stone-100 py-3 ${
        bold ? "font-semibold" : "text-sm"
      }`}
    >
      <dt>{label}</dt>

      <dd
        className={`whitespace-nowrap font-medium ${
          deduction ? "text-red-700" : ""
        }`}
      >
        {deduction ? "− " : ""}
        {money(value)}
      </dd>
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="rounded-xl border border-stone-200 p-4">
      <p className="text-xs text-stone-500">
        {label}
      </p>

      <p className="mt-2 font-semibold">
        {value}
      </p>
    </div>
  );
}

function getSourceKey(employee, records) {
  return JSON.stringify({
    employee: [
      employee.id,
      employee.name,
      employee.role,
      employee.basic,
      employee.attendance,
      employee.travel,
      employee.meal,
      employee.bonus,
    ],

    records: records
      .map((record) => [
        record.id,
        record.employee,
        record.date,
        record.status,
        record.regular,
        record.late,
        record.leaveDuration,
        record.ot,
        record.double,
      ])
      .sort((a, b) =>
        String(a[0]).localeCompare(String(b[0])),
      ),
  });
}

function SalaryModal({
  employee,
  records,
  period,
  onClose,
}) {
  const [bonusDeduction, setBonusDeduction] =
    useState("0");

  const [calculation, setCalculation] = useState(null);
  const [error, setError] = useState("");

  const currentSource = getSourceKey(employee, records);

  const currentInput = JSON.stringify({
    bonusDeduction,
  });

  const needsRecalculation =
    calculation !== null &&
    (
      calculation.source !== currentSource ||
      calculation.input !== currentInput
    );

  const result =
    calculation && !needsRecalculation
      ? calculation.result
      : null;

  const recordedLate = records
    .filter((record) =>
      ["Present", "Partial day", "Half day"].includes(
        record.status,
      ),
    )
    .reduce(
      (total, record) =>
        total +
        (Number(record.late) || 0) +
        (Number(record.leaveDuration) || 0),
      0,
    );

  function changeDeduction(value) {
    setBonusDeduction(value);
    setError("");
  }

  function calculate(event) {
    event.preventDefault();
    setError("");

    try {
      if (!records.length) {
        throw new Error(
          "No attendance records exist for this employee and month.",
        );
      }

      const invalidRecord = records.some(
        (record) =>
          record.employee !== employee.id ||
          typeof record.date !== "string" ||
          !record.date.startsWith(`${period}-`),
      );

      if (invalidRecord) {
        throw new Error(
          "Attendance records must belong to this employee and selected month.",
        );
      }

      const nextResult = calculateSalary(
        employee,
        records,
        {
          bonusDeduction,
          advance: 0,
          otherDeduction: 0,
        },
      );

      if (
        nextResult.calculationMode !== "attendance-based"
      ) {
        throw new Error(
          "Update domain/salary.js with the attendance-based salary calculation.",
        );
      }

      if (
        !nextResult.epf ||
        !Number.isFinite(nextResult.deductions?.epf) ||
        !Number.isFinite(nextResult.totalDeductions) ||
        !Number.isFinite(nextResult.payable)
      ) {
        throw new Error(
          "The salary calculation returned an invalid result.",
        );
      }

      setCalculation({
        result: nextResult,
        source: currentSource,
        input: currentInput,
      });
    } catch (failure) {
      setCalculation(null);

      setError(
        failure.message || "Unable to calculate salary.",
      );
    }
  }

  const summaryFields = result
    ? [
        ["Recorded dates", records.length],
        ["Worked days", result.counts.attendedDays],
        ["Holiday work days", result.counts.holidayDays],
        ["Paid leave days", result.counts.paid],
        ["Sick leave days", result.counts.sick],
        ["No-pay days", result.counts.noPay],
        [
          "Regular worked time",
          duration(result.time.regularMinutes),
        ],
        [
          "Total late",
          duration(result.time.lateMinutes),
        ],
        [
          "Other missing regular time",
          duration(result.time.otherMissingRegularMinutes),
        ],
        [
          "OT",
          duration(result.time.otMinutes),
        ],
        [
          "Double OT",
          duration(result.time.doubleMinutes),
        ],
      ]
    : [];

  return (
    <Modal
      title="Calculate employee salary"
      description={`${employee.name} · ${period}`}
      onClose={onClose}
      busy={false}
    >
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-4 border-b border-stone-100 pb-5">
          <img
            src="/company-logo.png"
            alt="Buddhi Lanka Engineers"
            className="h-14 w-20 object-contain"
          />

          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-800">
              Buddhi Lanka Engineers
            </p>

            <h3 className="mt-2 text-xl font-semibold">
              {employee.name}
            </h3>

            <p className="mt-1 text-sm text-stone-500">
              {employee.role || "—"} · {period}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryCard
            label="Attendance records"
            value={records.length}
          />

          <SummaryCard
            label="Configured monthly basic"
            value={money(employee.basic || 0)}
          />

          <SummaryCard
            label="Total late"
            value={duration(recordedLate)}
          />
        </div>

        <form
          onSubmit={calculate}
          className="space-y-4"
        >
          <Field label="Production bonus deduction (LKR)">
            <input
              required
              type="number"
              min="0"
              step="0.01"
              value={bonusDeduction}
              onChange={(event) =>
                changeDeduction(event.target.value)
              }
            />
          </Field>

          <p className="text-sm leading-relaxed text-stone-500">
            Enter 0 if no additional manual bonus deduction
            applies. Automatic bonus late deductions are
            calculated separately.
          </p>

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={!records.length}
          >
            Calculate salary
          </Button>
        </form>

        {needsRecalculation && (
          <p
            role="status"
            className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
          >
            The deduction, employee details or attendance
            has changed. Press Calculate salary again.
          </p>
        )}

        {!calculation && !error && (
          <p className="rounded-xl border border-stone-200 p-4 text-sm text-stone-500">
            Press Calculate salary to display the final amount.
          </p>
        )}

        {result && (
          <>
            <div
              role="status"
              className="rounded-2xl bg-emerald-900 p-5 text-white"
            >
              <p className="text-sm text-emerald-100">
                Salary for recorded attendance
              </p>

              <p className="mt-3 text-sm">
                Net payable
              </p>

              <p className="mt-2 text-3xl font-semibold">
                {money(result.payable)}
              </p>

              <p className="mt-3 text-xs text-emerald-100">
                Employee EPF (8%):{" "}
                {money(result.deductions.epf)}
              </p>
            </div>

            <section>
              <h3 className="mb-3 font-semibold">
                Attendance summary
              </h3>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {summaryFields.map(([label, value]) => (
                  <SummaryCard
                    key={label}
                    label={label}
                    value={value}
                  />
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-stone-200 p-4">
              <h3 className="mb-3 font-semibold">
                Salary calculation basis
              </h3>

              <div className="grid gap-3 sm:grid-cols-3">
                <SummaryCard
                  label="Covered days"
                  value={result.counts.coveredDays}
                />

                <SummaryCard
                  label="Basic base days / 25"
                  value={result.counts.basicBaseDays}
                />

                <SummaryCard
                  label="Allowance base days / 26"
                  value={result.counts.allowanceBaseDays}
                />
              </div>

              <p className="mt-4 text-xs leading-relaxed text-stone-500">
                A completed Saturday regular shift earns a
                full Basic day. Late and other missing
                scheduled Regular time are deducted once.
                Unrecorded dates are not automatically No pay.
              </p>
            </section>

            <section className="rounded-xl border border-stone-200 p-4">
              <h3 className="mb-3 font-semibold">
                Calculation rates
              </h3>

              <p className="mb-3 text-xs leading-relaxed text-stone-500">
                Basic uses 25 days. Allowances use 26 days.
                Calculations retain full precision through
                the final minute. Displayed amounts use two
                decimal places.
              </p>

              <dl>
                {[
                  ["Basic daily rate", result.rates.daily],
                  ["Basic hourly rate", result.rates.hourly],
                  ["OT hourly rate", result.rates.ot],
                  [
                    "Double OT hourly rate",
                    result.rates.double,
                  ],
                  [
                    "Travel daily rate",
                    result.rates.travelDaily,
                  ],
                  [
                    "Meal daily rate",
                    result.rates.mealDaily,
                  ],
                  [
                    "Production bonus daily rate",
                    result.rates.bonusDaily,
                  ],
                ].map(([label, value]) => (
                  <AmountRow
                    key={label}
                    label={label}
                    value={value}
                  />
                ))}
              </dl>
            </section>

            <section className="rounded-xl border border-stone-200 p-4">
              <h3 className="mb-3 font-semibold">
                Earnings before deductions
              </h3>

              <dl>
                {[
                  [
                    "Basic calculation base",
                    result.earnedBeforeDeductions.basic,
                  ],
                  [
                    "Travel calculation base",
                    result.earnedBeforeDeductions.travel,
                  ],
                  [
                    "Meal calculation base",
                    result.earnedBeforeDeductions.meal,
                  ],
                  [
                    "Production bonus calculation base",
                    result.earnedBeforeDeductions.bonus,
                  ],
                ].map(([label, value]) => (
                  <AmountRow
                    key={label}
                    label={label}
                    value={value}
                  />
                ))}
              </dl>
            </section>

            <section className="rounded-xl border border-stone-200 p-4">
              <h3 className="mb-3 font-semibold">
                Deductions already applied to earnings
              </h3>

              <dl>
                {[
                  [
                    "Basic deduction",
                    result.deductions.basic,
                  ],
                  [
                    "Meal deduction",
                    result.deductions.meal,
                  ],
                  [
                    "Travel standard deduction",
                    result.deductions.travel,
                  ],
                  [
                    "Travel penalty",
                    result.deductions.travelPenalty,
                  ],
                  [
                    "Production bonus late deduction",
                    result.deductions.bonusLate,
                  ],
                  [
                    "Manual production bonus deduction",
                    result.deductions.bonusManual,
                  ],
                ].map(([label, value]) => (
                  <AmountRow
                    key={label}
                    label={label}
                    value={value}
                    deduction
                  />
                ))}
              </dl>

              <p className="mt-3 text-xs text-stone-500">
                These deductions are already included in
                the salary components below.
              </p>
            </section>

            <section className="rounded-xl border border-stone-200 p-4">
              <h3 className="mb-3 font-semibold">
                Salary summary
              </h3>

              <dl>
                {earningFields.map(([key, label]) => (
                  <AmountRow
                    key={key}
                    label={label}
                    value={result.earnings[key]}
                  />
                ))}

                <AmountRow
                  label="Gross salary"
                  value={result.gross}
                  bold
                />

                <AmountRow
                  label="Employee EPF (8%)"
                  value={result.deductions.epf}
                  deduction
                />

                <p className="py-3 text-xs text-stone-500">
                  EPF base: {money(result.epf.base)} × 8%
                </p>

                <div className="flex justify-between gap-4 border-t border-stone-200 pt-4 font-semibold text-emerald-900">
                  <dt>Net payable</dt>

                  <dd className="whitespace-nowrap">
                    {money(result.payable)}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="border-t border-stone-100 pt-4">
              <h3 className="font-semibold">
                Employee paysheet
              </h3>

              <DownloadPaysheet
                key={`${calculation.source}:${calculation.input}`}
                employee={employee}
                period={period}
                result={result}
              />
            </section>
          </>
        )}

        <p className="text-xs text-stone-500">
          This calculation is not saved to Firestore.
          Download the paysheet before closing.
        </p>
      </div>

      <footer className="sticky bottom-0 flex justify-end border-t border-stone-100 bg-[#f8faf6] px-6 py-4">
        <Button
          type="button"
          secondary
          onClick={onClose}
        >
          Close
        </Button>
      </footer>
    </Modal>
  );
}

export function PayrollPage() {
  const { period } = usePeriod();

  const {
    records: employees,
    loading: employeesLoading,
    error: employeesError,
  } = useRecords("employees");

  const {
    records: attendance,
    loading: attendanceLoading,
    error: attendanceError,
  } = useRecords("attendance");

  const [selection, setSelection] = useState(null);

  const loading = employeesLoading || attendanceLoading;
  const error = employeesError || attendanceError;

  const monthlyAttendance = attendance.filter(
    (record) =>
      typeof record.date === "string" &&
      record.date.startsWith(`${period}-`),
  );

  const recordCounts = new Map();

  for (const record of monthlyAttendance) {
    recordCounts.set(
      record.employee,
      (recordCounts.get(record.employee) || 0) + 1,
    );
  }

  const payrollEmployees = employees.filter(
    (employee) => recordCounts.has(employee.id),
  );

  const selectedEmployee =
    selection?.period === period
      ? payrollEmployees.find(
          (employee) => employee.id === selection.id,
        )
      : null;

  const selectedRecords = selectedEmployee
    ? monthlyAttendance.filter(
        (record) =>
          record.employee === selectedEmployee.id,
      )
    : [];

  function openCalculation(employee) {
    if (
      loading ||
      error ||
      !recordCounts.has(employee.id)
    ) {
      return;
    }

    setSelection({
      id: employee.id,
      period,
    });
  }

  function closeCalculation() {
    setSelection(null);
  }

  return (
    <>
      <PageHeader
        title="Monthly payroll"
        description={`Employees with attendance records for ${period}.`}
      />

      {error && <Message>{error}</Message>}

      {loading && (
        <Message>Loading payroll records…</Message>
      )}

      {!loading && !error && (
        <>
          <p className="mb-4 text-sm text-stone-500">
            These are configured monthly salary values.
            Select Calculate salary to view the amount
            payable for recorded attendance.
          </p>

          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Role</th>
                  <th>Monthly basic</th>
                  <th>Monthly attendance</th>
                  <th>Monthly travel</th>
                  <th>Monthly meal</th>
                  <th>Monthly bonus</th>
                  <th>Recorded dates</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {payrollEmployees.map((employee) => (
                  <tr key={employee.id}>
                    <td className="font-semibold">
                      {employee.name}
                    </td>

                    <td>{employee.role || "—"}</td>

                    {[
                      "basic",
                      "attendance",
                      "travel",
                      "meal",
                      "bonus",
                    ].map((key) => (
                      <td
                        key={key}
                        className="whitespace-nowrap"
                      >
                        {money(employee[key] || 0)}
                      </td>
                    ))}

                    <td>
                      {recordCounts.get(employee.id) || 0}
                    </td>

                    <td>
                      <button
                        type="button"
                        onClick={() =>
                          openCalculation(employee)
                        }
                        className="whitespace-nowrap font-semibold text-emerald-800 underline"
                      >
                        Calculate salary
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!payrollEmployees.length && (
              <p className="py-8 text-center text-stone-500">
                No attendance records for this pay period.
              </p>
            )}
          </div>

          {selectedEmployee && selectedRecords.length > 0 && (
            <SalaryModal
              key={`${period}:${selectedEmployee.id}`}
              employee={selectedEmployee}
              records={selectedRecords}
              period={period}
              onClose={closeCalculation}
            />
          )}
        </>
      )}
    </>
  );
}