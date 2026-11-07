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
  ["basic", "Earned basic salary"],
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

function sourceKey(employee, records) {
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
  const [bonusDeduction, setBonusDeduction] = useState("0");
  const [calculation, setCalculation] = useState(null);
  const [error, setError] = useState("");

  const currentSource = sourceKey(employee, records);

  const needsRecalculation =
    calculation !== null &&
    (
      calculation.source !== currentSource ||
      calculation.input !== bonusDeduction
    );

  const result =
    calculation && !needsRecalculation
      ? calculation.result
      : null;

  const recordedLate = records
    .filter(
      (record) =>
        !["Paid leave", "Sick leave", "No pay"].includes(
          record.status,
        ),
    )
    .reduce(
      (total, record) =>
        total +
        Number(record.late || 0) +
        Number(record.leaveDuration || 0),
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
          "No attendance records exist for this employee and pay period.",
        );
      }

      const nextResult = calculateSalary(employee, records, {
        bonusDeduction,
        advance: 0,
        otherDeduction: 0,
      });

      if (
        !nextResult.epf ||
        !Number.isFinite(nextResult.deductions.epf) ||
        !Number.isFinite(nextResult.totalDeductions)
      ) {
        throw new Error(
          "Update domain/salary.js with the EPF-enabled calculation.",
        );
      }

      setCalculation({
        result: nextResult,
        source: currentSource,
        input: bonusDeduction,
      });
    } catch (failure) {
      setCalculation(null);
      setError(
        failure.message || "Unable to calculate salary.",
      );
    }
  }

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
              {employee.role} · Pay period: {period}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <p className="text-sm text-stone-500">
              Attendance records
            </p>

            <p className="mt-2 font-semibold">
              {records.length}
            </p>
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <p className="text-sm text-stone-500">
              Monthly production bonus
            </p>

            <p className="mt-2 font-semibold">
              {money(employee.bonus || 0)}
            </p>
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
            <p className="text-sm text-stone-500">
              Arrival late + personal leave
            </p>

            <p className="mt-2 font-semibold">
              {duration(recordedLate)}
            </p>
          </div>
        </div>

        <form onSubmit={calculate} className="space-y-4">
          <Field label="Production bonus deduction (LKR)">
            <input
              autoFocus
              required
              type="number"
              min="0"
              max={Number(employee.bonus || 0)}
              step="0.01"
              value={bonusDeduction}
              onChange={(event) =>
                changeDeduction(event.target.value)
              }
            />
          </Field>

          <p className="text-sm text-stone-500">
            Enter 0 if no production bonus deduction applies.
            Salary is calculated only when you press Calculate salary.
          </p>

          {error && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              {error}
            </div>
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
            The deduction or source records have changed. Press
            Calculate salary again to display the updated total.
          </p>
        )}

        {!calculation && !error && (
          <p className="rounded-xl border border-stone-200 p-4 text-sm text-stone-500">
            The final salary will appear after calculation.
          </p>
        )}

        {result && (
          <>
            <div
              role="status"
              className="rounded-2xl bg-emerald-900 p-5 text-white"
            >
              <p className="text-sm text-emerald-100">
                Earned salary after EPF
              </p>

              <p className="mt-2 text-3xl font-semibold">
                {money(result.payable)}
              </p>

              <p className="mt-2 text-xs text-emerald-100">
                Employee EPF (8%):{" "}
                {money(result.deductions.epf)}
              </p>
            </div>

            <section>
              <h3 className="mb-3 font-semibold">
                Attendance summary
              </h3>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {[
                  ["Recorded dates", `${records.length} days`],
                  ["Paid leave", `${result.counts.paid} days`],
                  ["Sick leave", `${result.counts.sick} days`],
                  ["No pay", `${result.counts.noPay} days`],
                  [
                    "Regular worked time",
                    duration(
                      records.reduce(
                        (total, record) =>
                          total + Number(record.regular || 0),
                        0,
                      ),
                    ),
                  ],
                  [
                    "Total late",
                    duration(result.time.lateMinutes),
                  ],
                  [
                    "Late converted to days",
                    `${result.counts.lateDays} days`,
                  ],
                  [
                    "Remaining late",
                    duration(result.time.extraLateMinutes),
                  ],
                  ["OT", duration(result.time.otMinutes)],
                  [
                    "Double OT",
                    duration(result.time.doubleMinutes),
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-stone-200 p-3"
                  >
                    <p className="text-xs text-stone-500">
                      {label}
                    </p>

                    <p className="mt-2 text-sm font-semibold">
                      {value}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-stone-200 p-4">
              <h3 className="mb-3 font-semibold">
                Calculation breakdown
              </h3>

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
                    "Basic deduction",
                    result.deductions.basic,
                  ],
                  [
                    "Attendance penalty",
                    result.deductions.attendance,
                  ],
                  ["Meal deduction", result.deductions.meal],
                  [
                    "Travel standard deduction",
                    result.deductions.travel,
                  ],
                  [
                    "Travel penalty",
                    result.deductions.travelPenalty,
                  ],
                  [
                    "Production bonus deduction",
                    result.deductions.bonus,
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

                <div className="py-3 text-xs text-stone-500">
                  EPF base: {money(result.epf.base)}
                  {" × 8%"}
                </div>

                <div className="flex justify-between gap-4 border-t border-stone-200 pt-4 font-semibold text-emerald-900">
                  <dt>Net payable</dt>
                  <dd>{money(result.payable)}</dd>
                </div>
              </dl>
            </section>

            <section className="border-t border-stone-100 pt-4">
              <h3 className="font-semibold">
                Employee paysheet
              </h3>

              <DownloadPaysheet
                employee={employee}
                period={period}
                result={result}
              />
            </section>
          </>
        )}

        <p className="text-xs text-stone-500">
          This calculation and manual deduction are not saved to
          Firestore. Download the paysheet before closing.
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

  // Only attendance belonging to the selected month.
  const monthlyAttendance = attendance.filter(
    (record) =>
      typeof record.date === "string" &&
      record.date.startsWith(`${period}-`),
  );

  const employeeIdsWithAttendance = new Set(
    monthlyAttendance.map((record) => record.employee),
  );

  // Employees disappear from this list when their final attendance
  // record for the selected month is deleted.
  const payrollEmployees = employees.filter((employee) =>
    employeeIdsWithAttendance.has(employee.id),
  );

  // Use the filtered list so an open modal also closes when the
  // employee no longer has any attendance in this month.
  const selectedEmployee =
    selection?.period === period
      ? payrollEmployees.find(
          (employee) => employee.id === selection.id,
        )
      : null;

  const selectedRecords = selectedEmployee
    ? monthlyAttendance.filter(
        (record) => record.employee === selectedEmployee.id,
      )
    : [];

  function openCalculation(employee) {
    if (!employeeIdsWithAttendance.has(employee.id)) return;

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
          <div className="card overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Role</th>
                  <th>Basic salary</th>
                  <th>Attendance</th>
                  <th>Travel</th>
                  <th>Meal</th>
                  <th>Production bonus</th>
                  <th>Recorded dates</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {payrollEmployees.map((employee) => {
                  const recordCount = monthlyAttendance.filter(
                    (record) => record.employee === employee.id,
                  ).length;

                  return (
                    <tr key={employee.id}>
                      <td className="font-semibold">
                        {employee.name}
                      </td>

                      <td>{employee.role}</td>

                      {[
                        "basic",
                        "attendance",
                        "travel",
                        "meal",
                        "bonus",
                      ].map((key) => (
                        <td key={key}>
                          {money(employee[key] || 0)}
                        </td>
                      ))}

                      <td>{recordCount}</td>

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
                  );
                })}
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