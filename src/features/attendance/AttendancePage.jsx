import { useState } from "react";
import { deleteDoc, doc } from "firebase/firestore";

import { db } from "../../lib/firebase/client";
import { useRecords } from "../../shared/hooks/useRecords";
import { usePeriod } from "../../app/PeriodContext";
import {
  PageHeader,
  Button,
  Field,
  Stat,
  Message,
} from "../../shared/ui";
import { Modal } from "../../shared/ui/Modal";
import { duration } from "../../shared/utils/format";
import {
  calculateAttendance,
  getPersonalLeaves,
  validateDurations,
} from "./domain/time";

const blank = {
  employee: "",
  date: "",
  status: "Present",
  inTime: "",
  outTime: "",
  leaveOut: "",
  leaveIn: "",
  personalLeaves: [],
  overnight: false,
  breakMinutes: 0,
  regular: 0,
  late: 0,
  unpaid: 0,
  ot: 0,
  double: 0,
  leaveDuration: 0,
};

const statuses = [
  ["Present", "Present"],
  ["Paid leave", "Paid leave"],
  ["Sick leave", "Sick leave"],
  ["Partial day", "Half day"],
  ["No pay", "No pay"],
  ["Holiday work", "Holiday work"],
];

const leaveStatuses = ["Paid leave", "Sick leave", "No pay"];

const previewFields = [
  ["late", "Arrival late"],
  ["leaveDuration", "Personal leave late"],
  ["regular", "Regular worked time"],
  ["ot", "OT"],
  ["double", "Double OT"],
];

function getTodayDate() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type) =>
    parts.find((part) => part.type === type).value;

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function countLeaveDays(
  records,
  employeeId,
  date,
  excludedId,
  status,
  prefixLength,
) {
  if (!employeeId || !date) return 0;

  const prefix = `${date.slice(0, prefixLength)}-`;

  return new Set(
    records
      .filter(
        (record) =>
          record.id !== excludedId &&
          record.employee === employeeId &&
          record.status === status &&
          typeof record.date === "string" &&
          record.date.startsWith(prefix),
      )
      .map((record) => record.date),
  ).size;
}

function countPaidLeaveDays(records, employeeId, date, excludedId) {
  return countLeaveDays(
    records,
    employeeId,
    date,
    excludedId,
    "Paid leave",
    7,
  );
}

function countSickLeaveDays(records, employeeId, date, excludedId) {
  return countLeaveDays(
    records,
    employeeId,
    date,
    excludedId,
    "Sick leave",
    4,
  );
}

function clearLeaveTimes(record) {
  return {
    ...record,
    inTime: "",
    outTime: "",
    leaveOut: "",
    leaveIn: "",
    personalLeaves: [],
    overnight: false,
    breakMinutes: 0,
    regular: 0,
    late: 0,
    unpaid:
      record.status === "No pay"
        ? record.unpaid > 0
          ? record.unpaid
          : 480
        : 0,
    ot: 0,
    double: 0,
    leaveDuration: 0,
  };
}

function displayWorkDuration(record, key) {
  if (
    record.status === "Holiday work" &&
    ["regular", "ot"].includes(key)
  ) {
    return "—";
  }

  return duration(record[key] || 0);
}

export function AttendancePage() {
  const { period } = usePeriod();

  const {
    records,
    saveRecord,
    error,
    loading: attendanceLoading,
  } = useRecords("attendance");

  const {
    records: employees,
    error: employeesError,
    loading: employeesLoading,
  } = useRecords("employees");

  const [filter, setFilter] = useState("");
  const [entry, setEntry] = useState(null);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const [deleteEntry, setDeleteEntry] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const recordsLoading = attendanceLoading || employeesLoading;
  const recordsError = error || employeesError;

  const rows = records
    .filter(
      (record) =>
        typeof record.date === "string" &&
        record.date.startsWith(`${period}-`) &&
        (!filter || record.employee === filter),
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalMinutes = (key) =>
    rows.reduce(
      (total, record) => total + (Number(record[key]) || 0),
      0,
    );

  // Total Late = Arrival late + Personal leave late.
  const totalLateMinutes =
    totalMinutes("late") + totalMinutes("leaveDuration");

  const monthlyPaidLeaveDays = new Set(
    rows
      .filter((record) => record.status === "Paid leave")
      .map((record) => record.date),
  ).size;

  const monthlySickLeaveDays = new Set(
    rows
      .filter((record) => record.status === "Sick leave")
      .map((record) => record.date),
  ).size;

  const summaryCards = [
    ["Regular worked time", duration(totalMinutes("regular"))],
    ["Total Late", duration(totalLateMinutes)],
    [
      "Paid leave",
      `${monthlyPaidLeaveDays} ${
        monthlyPaidLeaveDays === 1 ? "day" : "days"
      }`,
    ],
    [
      "Sick leave",
      `${monthlySickLeaveDays} ${
        monthlySickLeaveDays === 1 ? "day" : "days"
      }`,
    ],
    ["OT", duration(totalMinutes("ot"))],
    ["Double OT", duration(totalMinutes("double"))],
  ];

  const hasSelectedEmployee = Boolean(
    entry?.employee &&
      employees.some((employee) => employee.id === entry.employee),
  );

  const isLeaveEntry = Boolean(
    entry && leaveStatuses.includes(entry.status),
  );

  const paidLeaveUsed = countPaidLeaveDays(
    records,
    entry?.employee,
    entry?.date,
    entry?.id,
  );

  const sickLeaveUsed = countSickLeaveDays(
    records,
    entry?.employee,
    entry?.date,
    entry?.id,
  );

  const leaveRecordsReady = Boolean(
    hasSelectedEmployee &&
      entry?.date &&
      !recordsLoading &&
      !recordsError,
  );

  const canChoosePaidLeave =
    leaveRecordsReady && paidLeaveUsed < 2;

  const canChooseSickLeave =
    leaveRecordsReady && sickLeaveUsed < 7;

  let calculation = null;
  let calculationError = "";

  if (
    entry &&
    hasSelectedEmployee &&
    !isLeaveEntry &&
    entry.inTime &&
    entry.outTime
  ) {
    try {
      calculation = calculateAttendance(entry);
    } catch (failure) {
      calculationError = failure.message;
    }
  }

  function employeeName(id) {
    return employees.find((employee) => employee.id === id)?.name || id;
  }

  function update(key, value) {
    if (busy || !entry) return;
    if (key !== "employee" && !hasSelectedEmployee) return;

    setFormError("");

    setEntry((previous) => {
      const next = { ...previous, [key]: value };

      if (key !== "employee" && key !== "date") {
        return next;
      }

      const paidLimit =
        next.status === "Paid leave" &&
        countPaidLeaveDays(
          records,
          next.employee,
          next.date,
          next.id,
        ) >= 2;

      const sickLimit =
        next.status === "Sick leave" &&
        countSickLeaveDays(
          records,
          next.employee,
          next.date,
          next.id,
        ) >= 7;

      return paidLimit || sickLimit
        ? { ...next, status: "Present" }
        : next;
    });
  }

  function openEntry(record = null) {
    if (
      busy ||
      deleting ||
      deleteEntry ||
      recordsLoading ||
      recordsError
    ) {
      return;
    }

    setMessage("");
    setFormError("");

    const next = record
      ? {
          ...blank,
          ...record,
          status:
            record.status === "Half day"
              ? "Partial day"
              : record.status,
          personalLeaves: getPersonalLeaves(record).map(
            (leave) => ({ ...leave }),
          ),
        }
      : {
          ...blank,
          employee: filter || "",
          date: getTodayDate(),
          personalLeaves: [],
        };

    setEntry(
      leaveStatuses.includes(next.status)
        ? clearLeaveTimes(next)
        : next,
    );
  }

  function closeEntry() {
    if (busy) return;

    setEntry(null);
    setFormError("");
  }

  function changeStatus(status) {
    if (!hasSelectedEmployee || busy) return;

    if (status === "Paid leave" && !canChoosePaidLeave) {
      setFormError(
        paidLeaveUsed >= 2
          ? "The monthly limit of 2 paid leave days has been reached."
          : "Select a date and wait for attendance records to load.",
      );
      return;
    }

    if (status === "Sick leave" && !canChooseSickLeave) {
      setFormError(
        sickLeaveUsed >= 7
          ? "The yearly limit of 7 sick leave days has been reached."
          : "Select a date and wait for attendance records to load.",
      );
      return;
    }

    setFormError("");

    setEntry((previous) => {
      if (previous.status === status) return previous;

      const next = { ...previous, status };

      return leaveStatuses.includes(status)
        ? clearLeaveTimes({
            ...next,
            unpaid: status === "No pay" ? 480 : 0,
          })
        : next;
    });
  }

  function addPersonalLeave() {
    if (!hasSelectedEmployee || busy) return;

    setFormError("");

    setEntry((previous) => {
      if (previous.personalLeaves.length >= 20) return previous;

      return {
        ...previous,
        personalLeaves: [
          ...previous.personalLeaves,
          { out: "", in: "" },
        ],
      };
    });
  }

  function updatePersonalLeave(index, key, value) {
    if (!hasSelectedEmployee || busy) return;

    setFormError("");

    setEntry((previous) => ({
      ...previous,
      personalLeaves: previous.personalLeaves.map(
        (leave, leaveIndex) =>
          leaveIndex === index
            ? { ...leave, [key]: value }
            : leave,
      ),
    }));
  }

  function removePersonalLeave(index) {
    if (!hasSelectedEmployee || busy) return;

    setFormError("");

    setEntry((previous) => ({
      ...previous,
      personalLeaves: previous.personalLeaves.filter(
        (_, leaveIndex) => leaveIndex !== index,
      ),
    }));
  }

  async function save(event) {
    event.preventDefault();

    if (busy || !entry) return;

    setBusy(true);
    setFormError("");

    try {
      if (recordsLoading || recordsError) {
        throw new Error(
          "Attendance records must load successfully before saving.",
        );
      }

      if (!hasSelectedEmployee || !entry.date) {
        throw new Error("Select a valid employee and date.");
      }

      if (
        records.some(
          (record) =>
            record.id !== entry.id &&
            record.employee === entry.employee &&
            record.date === entry.date,
        )
      ) {
        throw new Error(
          "An entry already exists for this employee and date.",
        );
      }

      if (
        entry.status === "Paid leave" &&
        countPaidLeaveDays(
          records,
          entry.employee,
          entry.date,
          entry.id,
        ) >= 2
      ) {
        throw new Error(
          "The monthly limit of 2 paid leave days has been reached.",
        );
      }

      if (
        entry.status === "Sick leave" &&
        countSickLeaveDays(
          records,
          entry.employee,
          entry.date,
          entry.id,
        ) >= 7
      ) {
        throw new Error(
          "The yearly limit of 7 sick leave days has been reached.",
        );
      }

      let savingEntry;

      if (isLeaveEntry) {
        savingEntry = clearLeaveTimes(entry);
      } else {
        const calculated = calculateAttendance(entry);
        const firstLeave = entry.personalLeaves[0];

        savingEntry = {
          ...entry,
          ...calculated,
          leaveOut: firstLeave?.out || "",
          leaveIn: firstLeave?.in || "",
        };
      }

      validateDurations(savingEntry);
      await saveRecord(savingEntry);

      setEntry(null);

      setMessage(
        savingEntry.date.startsWith(`${period}-`)
          ? "Attendance saved."
          : `Attendance saved for ${savingEntry.date}. Select that pay period to view it.`,
      );
    } catch (failure) {
      setFormError(failure.message || "Unable to save attendance.");
    } finally {
      setBusy(false);
    }
  }

  function openDelete(record) {
    if (busy || deleting || entry || recordsError) return;

    setMessage("");
    setDeleteError("");
    setDeleteEntry(record);
  }

  function closeDelete() {
    if (deleting) return;

    setDeleteEntry(null);
    setDeleteError("");
  }

  async function confirmDelete() {
    if (!deleteEntry || deleting) return;

    setDeleting(true);
    setDeleteError("");

    try {
      if (!db) {
        throw new Error("Firebase is not connected.");
      }

      if (!deleteEntry.id) {
        throw new Error("Attendance entry ID is missing.");
      }

      await deleteDoc(doc(db, "attendance", deleteEntry.id));

      setDeleteEntry(null);
      setMessage("Attendance entry deleted.");
    } catch (failure) {
      setDeleteError(
        failure.code === "permission-denied"
          ? "Delete permission denied. Check your published rules."
          : failure.message || "Unable to delete attendance.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Attendance sheet"
        description="Arrival, personal leave, departure and calculated working time."
        action={
          <Button
            type="button"
            disabled={
              !employees.length ||
              recordsLoading ||
              Boolean(recordsError) ||
              busy ||
              deleting
            }
            onClick={() => openEntry()}
          >
            + Add entry
          </Button>
        }
      />

      {(recordsError || message) && (
        <Message>{recordsError || message}</Message>
      )}

      <Field label="Employee">
        <select
          className="max-w-xs"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="">All employees</option>

          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name}
            </option>
          ))}
        </select>
      </Field>

      {filter && (
        <div className="my-6 grid grid-cols-2 gap-4 xl:grid-cols-6">
          {summaryCards.map(([label, value]) => (
            <Stat key={label} label={label} value={value} />
          ))}
        </div>
      )}

      <div
        className={`card overflow-x-auto ${filter ? "" : "mt-6"}`}
      >
        <table className="w-full">
          <thead>
            <tr>
              <th rowSpan={2}>Date</th>
              <th rowSpan={2}>Employee</th>
              <th rowSpan={2}>In time</th>
              <th rowSpan={2}>Late time</th>
              <th colSpan={2} className="text-center">
                Personal leave
              </th>
              <th rowSpan={2}>Late time</th>
              <th rowSpan={2}>Out time</th>
              <th rowSpan={2}>Regular worked time</th>
              <th rowSpan={2}>OT</th>
              <th rowSpan={2}>Double OT</th>
              <th rowSpan={2}>Attendance type</th>
              <th rowSpan={2}>Actions</th>
            </tr>

            <tr>
              <th>Out</th>
              <th>In</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((record) => {
              const leaves = getPersonalLeaves(record);

              return (
                <tr key={record.id}>
                  <td className="whitespace-nowrap">
                    {record.date}
                  </td>

                  <td>{employeeName(record.employee)}</td>
                  <td>{record.inTime || "—"}</td>

                  <td className="whitespace-nowrap">
                    {duration(record.late || 0)}
                  </td>

                  {["out", "in"].map((key) => (
                    <td key={key}>
                      {leaves.length ? (
                        <div className="space-y-2">
                          {leaves.map((leave, index) => (
                            <div
                              key={index}
                              className="whitespace-nowrap"
                            >
                              {leave[key] || "—"}
                            </div>
                          ))}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  ))}

                  <td className="whitespace-nowrap">
                    {duration(record.leaveDuration || 0)}
                  </td>

                  <td className="whitespace-nowrap">
                    {record.outTime || "—"}
                    {record.overnight && " (+1)"}
                  </td>

                  {["regular", "ot", "double"].map((key) => (
                    <td key={key} className="whitespace-nowrap">
                      {displayWorkDuration(record, key)}
                    </td>
                  ))}

                  <td>
                    {record.status === "Partial day"
                      ? "Half day"
                      : record.status}
                  </td>

                  <td>
                    <div className="flex gap-4 whitespace-nowrap">
                      <button
                        type="button"
                        disabled={
                          busy ||
                          deleting ||
                          recordsLoading ||
                          Boolean(recordsError)
                        }
                        className="font-medium text-emerald-800 underline disabled:opacity-50"
                        onClick={() => openEntry(record)}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        disabled={
                          busy || deleting || Boolean(recordsError)
                        }
                        className="font-medium text-red-600 underline disabled:opacity-50"
                        onClick={() => openDelete(record)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {recordsLoading ? (
          <p className="py-8">Loading attendance…</p>
        ) : !rows.length ? (
          <p className="py-8">No attendance for this selection.</p>
        ) : null}
      </div>

      {entry && (
        <Modal
          title={
            entry.id
              ? "Edit attendance entry"
              : "Daily attendance entry"
          }
          description="Record arrival, personal leave and final departure."
          onClose={closeEntry}
          busy={busy}
        >
          <form onSubmit={save}>
            <fieldset
              disabled={busy}
              className="m-0 min-w-0 space-y-6 border-0 p-6"
            >
              {formError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                >
                  {formError}
                </div>
              )}

              <section>
                <h3 className="mb-4 text-sm font-semibold">
                  Employee details
                </h3>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Employee name">
                    <select
                      required
                      value={entry.employee}
                      onChange={(event) =>
                        update("employee", event.target.value)
                      }
                    >
                      <option value="" disabled>
                        Select employee
                      </option>

                      {employees.map((employee) => (
                        <option
                          key={employee.id}
                          value={employee.id}
                        >
                          {employee.name}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Date">
                    <input
                      required
                      disabled={!hasSelectedEmployee}
                      type="date"
                      value={entry.date}
                      onChange={(event) =>
                        update("date", event.target.value)
                      }
                    />
                  </Field>

                  <div>
                    <Field label="Attendance type">
                      <select
                        disabled={!hasSelectedEmployee}
                        value={entry.status}
                        onChange={(event) =>
                          changeStatus(event.target.value)
                        }
                      >
                        {statuses.map(([status, label]) => {
                          const unavailable =
                            status === "Paid leave"
                              ? !canChoosePaidLeave
                              : status === "Sick leave"
                                ? !canChooseSickLeave
                                : false;

                          const limitLabel =
                            status === "Paid leave" &&
                            paidLeaveUsed >= 2
                              ? " — monthly limit reached"
                              : status === "Sick leave" &&
                                  sickLeaveUsed >= 7
                                ? " — yearly limit reached"
                                : "";

                          return (
                            <option
                              key={status}
                              value={status}
                              disabled={unavailable}
                            >
                              {label}
                              {limitLabel}
                            </option>
                          );
                        })}
                      </select>
                    </Field>

                    {leaveRecordsReady && (
                      <div className="mt-2 space-y-1 text-xs">
                        <p
                          className={
                            paidLeaveUsed >= 2
                              ? "text-red-600"
                              : "text-stone-600"
                          }
                        >
                          Paid leave available for{" "}
                          {entry.date.slice(0, 7)}:{" "}
                          {Math.max(0, 2 - paidLeaveUsed)} / 2
                        </p>

                        <p
                          className={
                            sickLeaveUsed >= 7
                              ? "text-red-600"
                              : "text-stone-600"
                          }
                        >
                          Sick leave available for{" "}
                          {entry.date.slice(0, 4)}:{" "}
                          {Math.max(0, 7 - sickLeaveUsed)} / 7
                        </p>

                        {entry.id && (
                          <p className="text-stone-500">
                            Available balances exclude the entry
                            being edited.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {!hasSelectedEmployee && (
                  <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    Select an employee first to enter attendance
                    details.
                  </p>
                )}

                {hasSelectedEmployee && isLeaveEntry && (
                  <p
                    role="status"
                    className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
                  >
                    {entry.status === "No pay"
                      ? `No pay selected. Unpaid time: ${duration(entry.unpaid)}.`
                      : `${entry.status} selected for this date.`}
                  </p>
                )}
              </section>

              {!isLeaveEntry && (
                <fieldset
                  disabled={!hasSelectedEmployee}
                  className={`m-0 min-w-0 space-y-5 border-0 border-t border-solid border-stone-100 p-0 pt-5 ${
                    !hasSelectedEmployee ? "opacity-50" : ""
                  }`}
                >
                  <h3 className="text-sm font-semibold">
                    Regular times
                  </h3>

                  <Field label="In time">
                    <input
                      required
                      type="time"
                      value={entry.inTime}
                      onChange={(event) =>
                        update("inTime", event.target.value)
                      }
                    />
                  </Field>

                  <div className="rounded-xl border border-stone-200 p-4">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <h4 className="text-sm font-semibold">
                        Personal leave
                      </h4>

                      <Button
                        type="button"
                        secondary
                        disabled={
                          !hasSelectedEmployee ||
                          busy ||
                          entry.personalLeaves.length >= 20
                        }
                        onClick={addPersonalLeave}
                      >
                        + Add leave period
                      </Button>
                    </div>

                    {!entry.personalLeaves.length && (
                      <p className="text-sm text-stone-500">
                        Add each time the employee leaves and returns.
                      </p>
                    )}

                    <div className="space-y-4">
                      {entry.personalLeaves.map((leave, index) => (
                        <div
                          key={index}
                          className="rounded-lg border border-stone-200 bg-stone-50 p-4"
                        >
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold">
                              Leave period {index + 1}
                            </p>

                            <button
                              type="button"
                              className="text-sm font-medium text-red-600 underline"
                              onClick={() =>
                                removePersonalLeave(index)
                              }
                            >
                              Remove
                            </button>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Personal leave out">
                              <input
                                required
                                type="time"
                                value={leave.out}
                                onChange={(event) =>
                                  updatePersonalLeave(
                                    index,
                                    "out",
                                    event.target.value,
                                  )
                                }
                              />
                            </Field>

                            <Field label="Personal leave in">
                              <input
                                required
                                type="time"
                                value={leave.in}
                                onChange={(event) =>
                                  updatePersonalLeave(
                                    index,
                                    "in",
                                    event.target.value,
                                  )
                                }
                              />
                            </Field>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Field label="Out time">
                    <input
                      required
                      type="time"
                      value={entry.outTime}
                      onChange={(event) =>
                        update("outTime", event.target.value)
                      }
                    />
                  </Field>

                  <div
                    aria-live="polite"
                    className="rounded-lg border border-stone-200 bg-[#f3f7ee] p-4 text-sm"
                  >
                    {!hasSelectedEmployee ? (
                      <p>Select an employee first.</p>
                    ) : calculationError ? (
                      <p className="text-red-700">
                        {calculationError}
                      </p>
                    ) : calculation ? (
                      <dl className="grid gap-4 sm:grid-cols-2">
                        {previewFields.map(([key, label]) => (
                          <div key={key}>
                            <dt className="text-xs">{label}</dt>

                            <dd className="mt-1 font-semibold">
                              {displayWorkDuration(
                                {
                                  ...calculation,
                                  status: entry.status,
                                },
                                key,
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p>
                        Enter In and Out times to calculate working
                        time.
                      </p>
                    )}
                  </div>
                </fieldset>
              )}
            </fieldset>

            <footer className="sticky bottom-0 flex justify-end gap-3 border-t border-stone-100 bg-[#f8faf6] px-6 py-4">
              <Button
                type="button"
                secondary
                disabled={busy}
                onClick={closeEntry}
              >
                Cancel
              </Button>

              <Button
                type="submit"
                disabled={
                  !hasSelectedEmployee ||
                  busy ||
                  recordsLoading ||
                  Boolean(recordsError)
                }
              >
                {busy ? "Saving…" : "Save attendance"}
              </Button>
            </footer>
          </form>
        </Modal>
      )}

      {deleteEntry && (
        <Modal
          title="Delete attendance entry"
          description="Confirm the attendance entry you want to delete."
          onClose={closeDelete}
          busy={deleting}
        >
          <div className="space-y-4 p-6">
            {deleteError && (
              <p
                role="alert"
                className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
              >
                {deleteError}
              </p>
            )}

            <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
              <p className="font-semibold">
                {employeeName(deleteEntry.employee)}
              </p>

              <p className="mt-2 text-sm">
                Date: {deleteEntry.date}
              </p>

              <p className="mt-1 text-sm">
                Status: {deleteEntry.status}
              </p>
            </div>

            <p className="text-sm text-stone-600">
              This permanently deletes the attendance entry.
              Recalculate any salary affected by this change.
            </p>
          </div>

          <footer className="flex justify-end gap-3 border-t border-stone-100 bg-[#f8faf6] px-6 py-4">
            <Button
              type="button"
              secondary
              disabled={deleting}
              onClick={closeDelete}
            >
              Cancel
            </Button>

            <button
              type="button"
              disabled={deleting}
              onClick={confirmDelete}
              className="rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete attendance"}
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}