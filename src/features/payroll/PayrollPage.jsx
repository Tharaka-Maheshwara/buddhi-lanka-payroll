import { useState } from "react";

import { useRecords } from "../../shared/hooks/useRecords";
import { usePeriod } from "../../app/PeriodContext";
import {
  Button,
  Field,
  Message,
  PageHeader,
} from "../../shared/ui";

import { money, duration } from "../../shared/utils/format";
import { calculateSalary } from "./domain/salary";
import { DownloadPaysheet } from "./DownloadPaysheet";

const earningLabels = {
  basic: "Basic salary after deductions",
  attendance: "Attendance allowance",
  travel: "Travelling allowance",
  meal: "Meal allowance",
  bonus: "Production bonus",
  ot: "OT payment",
  double: "Double OT payment",
};

const earningKeys = [
  "basic",
  "attendance",
  "travel",
  "meal",
  "bonus",
  "ot",
  "double",
];

function AmountRow({ label, value, deduction = false, bold = false }) {
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

function PayrollDetails({ employee, records, period }) {
  const [input, setInput] = useState({
    lateMinutes: "",
    bonusDeduction: "0",
    advance: "0",
    otherDeduction: "0",
  });

  function update(key, value) {
    setInput((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  let result = null;
  let calculationError = "";

  try {
    result = calculateSalary(employee, records, {
      ...input,
      lateMinutes:
        input.lateMinutes === "" ? undefined : input.lateMinutes,
    });

    if (
      !result.epf ||
      !Number.isFinite(result.deductions.epf) ||
      !Number.isFinite(result.totalDeductions)
    ) {
      throw new Error(
        "Update domain/salary.js with the EPF-enabled calculation code.",
      );
    }
  } catch (error) {
    result = null;
    calculationError = error.message;
  }

  const automaticLate = records
    .filter(
      (record) =>
        !["Paid leave", "Sick leave", "No pay"].includes(record.status),
    )
    .reduce(
      (total, record) =>
        total +
        Number(record.late || 0) +
        Number(record.leaveDuration || 0),
      0,
    );

  return (
    <section className="card mt-6">
      <div className="mb-6 flex items-center gap-4 border-b border-stone-200 pb-5">
        <img
          src="/company-logo.png"
          alt="Buddhi Lanka Engineers"
          className="h-16 w-24 object-contain"
        />

        <div>
          <h2 className="font-semibold">
            BUDDHI LANKA ENGINEERS
          </h2>

          <p className="text-sm text-stone-500">
            Salary calculation preview · {period}
          </p>
        </div>
      </div>

      <h2 className="text-xl font-semibold">
        {employee.name}
      </h2>

      <p className="mt-1 text-sm text-stone-500">
        {employee.role}
      </p>

      <div className="mt-6 rounded-xl border border-stone-200 bg-stone-50 p-4">
        <p className="text-sm">
          Recorded arrival late + personal leave:{" "}
          <strong>{duration(automaticLate)}</strong>
        </p>

        <p className="mt-2 text-sm text-stone-600">
          Leave approved late minutes empty to use the recorded total.
          To include early departure or correct the total, enter the
          complete approved monthly late time below.
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Field label="Approved monthly late time (minutes, optional)">
          <input
            type="number"
            min="0"
            step="1"
            placeholder={String(automaticLate)}
            value={input.lateMinutes}
            onChange={(event) =>
              update("lateMinutes", event.target.value)
            }
          />
        </Field>

        <Field label="Production bonus deduction (LKR)">
          <input
            type="number"
            min="0"
            max={employee.bonus || 0}
            step="0.01"
            value={input.bonusDeduction}
            onChange={(event) =>
              update("bonusDeduction", event.target.value)
            }
          />
        </Field>

        <Field label="Advance (LKR)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={input.advance}
            onChange={(event) =>
              update("advance", event.target.value)
            }
          />
        </Field>

        <Field label="Other deductions (LKR)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={input.otherDeduction}
            onChange={(event) =>
              update("otherDeduction", event.target.value)
            }
          />
        </Field>
      </div>

      {calculationError && (
        <p role="alert" className="mt-5 text-sm text-red-700">
          {calculationError}
        </p>
      )}

      {result && (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Paid leave", `${result.counts.paid} days`],
              ["Sick leave", `${result.counts.sick} days`],
              ["No pay", `${result.counts.noPay} days`],
              [
                "Total late time",
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
              ["Double OT", duration(result.time.doubleMinutes)],
            ].map(([label, value]) => (
              <div
                key={label}
                className="rounded-xl border border-stone-200 p-4"
              >
                <p className="text-sm text-stone-500">
                  {label}
                </p>

                <p className="mt-2 font-semibold">
                  {value}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-stone-200 p-5">
              <h3 className="mb-3 font-semibold">
                Calculation breakdown
              </h3>

              <dl>
                {[
                  ["Basic daily rate", result.rates.daily],
                  ["Basic hourly rate", result.rates.hourly],
                  ["OT hourly rate", result.rates.ot],
                  ["Double OT hourly rate", result.rates.double],
                  ["Basic deduction", result.deductions.basic],
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

              <div className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                <h4 className="text-sm font-semibold text-emerald-900">
                  Employee EPF calculation
                </h4>

                <p className="mt-2 text-sm text-emerald-900">
                  {money(result.epf.base)} × 8% ={" "}
                  <strong>
                    {money(result.deductions.epf)}
                  </strong>
                </p>

                <p className="mt-2 text-xs text-emerald-800">
                  Calculated from basic salary after deductions,
                  following the supplied worksheet.
                </p>
              </div>
            </section>

            <section className="rounded-xl border border-stone-200 p-5">
              <h3 className="mb-3 font-semibold">
                Salary summary
              </h3>

              <dl>
                {earningKeys.map((key) => (
                  <AmountRow
                    key={key}
                    label={earningLabels[key]}
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

                <AmountRow
                  label="Advance"
                  value={result.deductions.advance}
                  deduction
                />

                <AmountRow
                  label="Other deductions"
                  value={result.deductions.other}
                  deduction
                />

                <AmountRow
                  label="Total deductions from gross"
                  value={result.totalDeductions}
                  deduction
                  bold
                />

                <div className="mt-4 flex justify-between gap-4 rounded-xl bg-emerald-900 p-4 font-semibold text-white">
                  <dt>Net payable</dt>

                  <dd className="whitespace-nowrap">
                    {money(result.payable)}
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          <div className="mt-6 border-t border-stone-200 pt-5">
            <h3 className="font-semibold">
              Employee paysheet
            </h3>

            <p className="mt-2 text-sm text-stone-500">
              Download a separate PDF for {employee.name} using
              the current salary calculation.
            </p>

            <DownloadPaysheet
              employee={employee}
              period={period}
              result={result}
            />
          </div>
        </>
      )}

      <p className="mt-5 text-sm text-stone-500">
        Manual adjustments are included in the downloaded paysheet,
        but are not saved to Firestore. Closing this calculation or
        changing the employee or period resets these adjustments.
      </p>
    </section>
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

  const rows = employees.map((employee) => {
    const records = monthlyAttendance.filter(
      (record) => record.employee === employee.id,
    );

    try {
      const result = calculateSalary(employee, records);

      if (
        !result.epf ||
        !Number.isFinite(result.deductions.epf)
      ) {
        throw new Error(
          "Update domain/salary.js with the EPF-enabled calculation.",
        );
      }

      return {
        employee,
        records,
        result,
        error: "",
      };
    } catch (error) {
      return {
        employee,
        records,
        result: null,
        error: error.message,
      };
    }
  });

  const selected =
    selection?.period === period
      ? rows.find(
          (row) => row.employee.id === selection.id,
        )
      : null;

  return (
    <>
      <PageHeader
        title="Monthly payroll"
        description={`Salary calculation preview for ${period}.`}
      />

      {error && <Message>{error}</Message>}

      {loading && (
        <Message>Loading payroll records…</Message>
      )}

      {!loading && !error && (
        <>
          <p className="mb-4 text-sm text-stone-500">
            Table amounts use default adjustments. Open View /
            Calculate to enter advances and manual deductions.
          </p>

          <div className="card overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Adjusted basic</th>
                  <th>Attendance</th>
                  <th>Travel</th>
                  <th>Meal</th>
                  <th>Bonus</th>
                  <th>OT</th>
                  <th>Double OT</th>
                  <th>Gross salary</th>
                  <th>EPF (8%)</th>
                  <th>Net payable</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => (
                  <tr key={row.employee.id}>
                    <td className="font-semibold">
                      {row.employee.name}
                    </td>

                    {row.result ? (
                      <>
                        {earningKeys.map((key) => (
                          <td key={key}>
                            {money(row.result.earnings[key])}
                          </td>
                        ))}

                        <td className="font-semibold">
                          {money(row.result.gross)}
                        </td>

                        <td className="text-red-700">
                          {money(row.result.deductions.epf)}
                        </td>

                        <td className="font-semibold text-emerald-900">
                          {money(row.result.payable)}
                        </td>
                      </>
                    ) : (
                      <td
                        colSpan={10}
                        className="text-red-700"
                      >
                        {row.error}
                      </td>
                    )}

                    <td>
                      <button
                        type="button"
                        className="whitespace-nowrap font-medium text-emerald-800 underline"
                        onClick={() =>
                          setSelection({
                            id: row.employee.id,
                            period,
                          })
                        }
                      >
                        View / Calculate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!rows.length && (
              <p className="py-8">
                Add employees to calculate payroll.
              </p>
            )}
          </div>

          {selected && (
            <>
              <PayrollDetails
                key={`${period}:${selected.employee.id}`}
                employee={selected.employee}
                records={selected.records}
                period={period}
              />

              <div className="mt-4">
                <Button
                  type="button"
                  secondary
                  onClick={() => setSelection(null)}
                >
                  Close calculation
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}