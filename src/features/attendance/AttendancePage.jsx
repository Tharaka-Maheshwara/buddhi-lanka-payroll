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
import { calculateClock, validateDurations } from "./domain/time";

function duration(value = 0) {
  const totalMinutes = Number(value);

  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) {
    return "—";
  }

  const minutes = Math.floor(totalMinutes);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours === 0) {
    return `${remainingMinutes} min`;
  }

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}min`;
}

function getTodayDate() {
  const today = new Date();

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

const blank = {
  employee: "",
  date: "",
  status: "Present",
  inTime: "",
  outTime: "",
  leaveOut: "",
  leaveIn: "",
  overnight: false,
  breakMinutes: 0,
  regular: 480,
  late: 0,
  unpaid: 0,
  ot: 0,
  double: 0,
};

const statuses = [
  "Present",
  "Paid leave",
  "Sick leave",
  "Partial day",
  "No pay",
  "Holiday work",
];

const leaveStatuses = ["Paid leave", "Sick leave", "No pay"];

const clockFields = [
  ["inTime", "In time"],
  ["outTime", "Out time"],
  ["leaveOut", "Personal leave out"],
  ["leaveIn", "Personal leave in"],
];

const durationFields = [
  ["late", "Arrival late time"],
  ["regular", "Regular worked time"],
  ["ot", "Normal OT"],
  ["double", "Double OT"],
  ["unpaid", "Total unpaid salary time"],
];

const summaryFields = [
  ["regular", "Regular worked time"],
  ["late", "Late time"],
  ["ot", "OT"],
  ["double", "Double OT"],
];

const headings = [
  "Date",
  "Employee",
  "In time",
  "Late",
  "Personal out",
  "Personal in",
  "Leave duration",
  "Out time",
  "Regular",
  "OT",
  "Double OT",
  "Day / No pay",
  "Unpaid",
  "Actions",
];

function clearLeaveTimes(record) {
  let unpaidMinutes = 0;

  if (record.status === "No pay") {
    unpaidMinutes =
      record.unpaid > 0 ? record.unpaid : blank.regular;
  }

  return {
    ...record,
    inTime: "",
    outTime: "",
    leaveOut: "",
    leaveIn: "",
    overnight: false,
    breakMinutes: 0,
    regular: 0,
    late: 0,
    unpaid: unpaidMinutes,
    ot: 0,
    double: 0,
    leaveDuration: 0,
  };
}

export function AttendancePage() {
  const { period } = usePeriod();

  const { records, saveRecord, error } = useRecords("attendance");
  const { records: employees } = useRecords("employees");

  const [filter, setFilter] = useState("");
  const [entry, setEntry] = useState(null);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const [deleteEntry, setDeleteEntry] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const rows = records
    .filter(
      (record) =>
        record.date.startsWith(period) &&
        (!filter || record.employee === filter),
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const isLeaveEntry = Boolean(
    entry && leaveStatuses.includes(entry.status),
  );

  let clock = null;
  let clockError = "";

  if (
    entry &&
    !isLeaveEntry &&
    (entry.inTime || entry.outTime)
  ) {
    try {
      clock = calculateClock(entry);
    } catch (error) {
      clockError = error.message;
    }
  }

  const update = (key, value) => {
    setEntry((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const changeStatus = (status) => {
    setFormError("");

    setEntry((previous) => {
      if (previous.status === status) {
        return previous;
      }

      const nextEntry = {
        ...previous,
        status,
      };

      if (leaveStatuses.includes(status)) {
        return clearLeaveTimes({
          ...nextEntry,
          unpaid: status === "No pay" ? blank.regular : 0,
        });
      }

      if (leaveStatuses.includes(previous.status)) {
        return {
          ...nextEntry,
          regular: blank.regular,
          unpaid: 0,
        };
      }

      return nextEntry;
    });
  };

  const openEntry = (record = null) => {
    if (busy || deleting || deleteEntry) return;

    setMessage("");
    setFormError("");

    const nextEntry = record
      ? { ...blank, ...record }
      : {
          ...blank,
          employee: filter || "",
          date: getTodayDate(),
        };

    setEntry(
      leaveStatuses.includes(nextEntry.status)
        ? clearLeaveTimes(nextEntry)
        : nextEntry,
    );
  };

  const closeEntry = () => {
    if (busy) return;

    setEntry(null);
    setFormError("");
  };

  const save = async (event) => {
    event.preventDefault();

    if (busy || !entry) return;

    setBusy(true);
    setFormError("");

    try {
      const savingEntry = isLeaveEntry
        ? clearLeaveTimes(entry)
        : {
            ...entry,
            leaveDuration: clock?.leave || 0,
          };

      validateDurations(savingEntry);

      if (!savingEntry.employee || !savingEntry.date) {
        throw new Error("Select an employee and date.");
      }

      const duplicate = records.some(
        (record) =>
          record.id !== savingEntry.id &&
          record.employee === savingEntry.employee &&
          record.date === savingEntry.date,
      );

      if (duplicate) {
        throw new Error(
          "An entry already exists for this employee and date.",
        );
      }

      if (!isLeaveEntry) {
        if (clockError) {
          throw new Error(clockError);
        }

        if (
          !clock &&
          (savingEntry.leaveOut || savingEntry.leaveIn)
        ) {
          throw new Error(
            "Enter shift In and Out times before personal leave.",
          );
        }

        const approvedTime =
          savingEntry.regular +
          savingEntry.ot +
          savingEntry.double;

        if (clock && approvedTime > clock.worked) {
          throw new Error(
            "Approved worked time exceeds time on site after leave and breaks.",
          );
        }
      }

      await saveRecord(savingEntry);

      setEntry(null);

      setMessage(
        savingEntry.date.startsWith(period)
          ? "Attendance saved."
          : `Attendance saved for ${savingEntry.date}. Select that pay period to view it.`,
      );
    } catch (error) {
      setFormError(error.message);
    } finally {
      setBusy(false);
    }
  };

  const openDelete = (record) => {
    if (busy || deleting || entry) return;

    setMessage("");
    setDeleteError("");
    setDeleteEntry(record);
  };

  const closeDelete = () => {
    if (deleting) return;

    setDeleteEntry(null);
    setDeleteError("");
  };

  const confirmDelete = async () => {
    if (!deleteEntry || deleting) return;

    setDeleting(true);
    setDeleteError("");

    try {
      if (!db) {
        throw new Error("Firebase is not connected.");
      }

      if (!deleteEntry.id) {
        throw new Error(
          "Unable to identify this attendance entry.",
        );
      }

      await deleteDoc(doc(db, "attendance", deleteEntry.id));

      setDeleteEntry(null);
      setMessage("Attendance entry deleted.");
    } catch (error) {
      setDeleteError(
        error.code === "permission-denied"
          ? "Delete permission denied. Publish the updated attendance rules."
          : error.message || "Unable to delete the entry. Please try again.",
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Attendance sheet"
        description="Arrival, personal leave, departure and approved overtime."
        action={
          <Button
            disabled={!employees.length || busy || deleting}
            onClick={() => openEntry()}
          >
            + Add entry
          </Button>
        }
      />

      {(error || message) && (
        <Message>{error || message}</Message>
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

      <div className="my-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {summaryFields.map(([key, label]) => (
          <Stat
            key={key}
            label={label}
            value={duration(
              rows.reduce(
                (total, record) => total + (record[key] || 0),
                0,
              ),
            )}
          />
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table>
          <thead>
            <tr>
              {headings.map((heading, index) => (
                <th key={index}>{heading}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((record) => (
              <tr key={record.id}>
                <td>{record.date}</td>

                <td>
                  {employees.find(
                    (employee) => employee.id === record.employee,
                  )?.name || record.employee}
                </td>

                <td>{record.inTime || "—"}</td>

                <td className="whitespace-nowrap">
                  {duration(record.late)}
                </td>

                <td>{record.leaveOut || "—"}</td>
                <td>{record.leaveIn || "—"}</td>

                <td className="whitespace-nowrap">
                  {duration(record.leaveDuration)}
                </td>

                <td className="whitespace-nowrap">
                  {record.outTime || "—"}
                  {record.overnight && " (+1)"}
                </td>

                {["regular", "ot", "double"].map((key) => (
                  <td key={key} className="whitespace-nowrap">
                    {duration(record[key])}
                  </td>
                ))}

                <td>{record.status}</td>

                <td className="whitespace-nowrap">
                  {duration(record.unpaid)}
                </td>

                <td>
                  <div className="flex items-center gap-4 whitespace-nowrap">
                    <button
                      type="button"
                      disabled={busy || deleting}
                      className="font-medium text-emerald-800 underline disabled:opacity-50"
                      onClick={() => openEntry(record)}
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      disabled={busy || deleting}
                      className="font-medium text-red-600 underline disabled:opacity-50"
                      onClick={() => openDelete(record)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!rows.length && (
          <p className="py-8">
            No attendance for this selection.
          </p>
        )}
      </div>

      <p className="mt-4 text-sm text-stone-600">
        Durations are displayed as hours and minutes, such as
        10 min or 1h 30min. Enter total unpaid salary time once.
      </p>

      {entry && (
        <Modal
          title={
            entry.id
              ? "Edit attendance entry"
              : "Daily attendance entry"
          }
          description="Record employee attendance, leave and approved overtime."
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
                      type="date"
                      value={entry.date}
                      onChange={(event) =>
                        update("date", event.target.value)
                      }
                    />
                  </Field>

                  <Field label="Day / No pay">
                    <select
                      value={entry.status}
                      onChange={(event) =>
                        changeStatus(event.target.value)
                      }
                    >
                      {statuses.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                {isLeaveEntry && (
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
                <>
                  <section className="border-t border-stone-100 pt-5">
                    <h3 className="mb-4 text-sm font-semibold">
                      Clock times
                    </h3>

                    <div className="grid gap-4 sm:grid-cols-2">
                      {clockFields.map(([key, label]) => (
                        <Field key={key} label={label}>
                          <input
                            type="time"
                            value={entry[key]}
                            onInput={(event) =>
                              update(
                                key,
                                event.currentTarget.value,
                              )
                            }
                          />
                        </Field>
                      ))}

                      <Field label="Out time date">
                        <select
                          value={String(entry.overnight)}
                          onChange={(event) =>
                            update(
                              "overnight",
                              event.target.value === "true",
                            )
                          }
                        >
                          <option value="false">Same day</option>
                          <option value="true">Next day</option>
                        </select>
                      </Field>

                      <Field label="Other unpaid breaks (minutes)">
                        <input
                          required
                          type="number"
                          min="0"
                          max="1440"
                          step="1"
                          value={entry.breakMinutes}
                          onChange={(event) =>
                            update(
                              "breakMinutes",
                              Number(event.target.value),
                            )
                          }
                        />

                        <p className="mt-2 text-sm font-medium text-emerald-800">
                          {duration(entry.breakMinutes)}
                        </p>
                      </Field>
                    </div>

                    <div
                      aria-live="polite"
                      className="mt-4 rounded-lg border border-stone-200 bg-[#f3f7ee] p-4 text-sm"
                    >
                      {clockError ? (
                        <p className="text-red-700">
                          {clockError}
                        </p>
                      ) : clock ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-xs">
                              Personal leave duration
                            </p>

                            <strong>
                              {duration(clock.leave)}
                            </strong>
                          </div>

                          <div>
                            <p className="text-xs">
                              Time after leave and breaks
                            </p>

                            <strong>
                              {duration(clock.worked)}
                            </strong>
                          </div>
                        </div>
                      ) : (
                        <p>
                          Enter In and Out times to calculate
                          time on site. Clock times are optional
                          for historical entries.
                        </p>
                      )}
                    </div>
                  </section>

                  <section className="border-t border-stone-100 pt-5">
                    <h3 className="mb-2 text-sm font-semibold">
                      Approved durations
                    </h3>

                    <p className="mb-4 text-xs text-stone-600">
                      Enter whole minutes. For example, enter 90
                      for 1h 30min. The duration appears below
                      each field.
                    </p>

                    <div className="grid gap-4 sm:grid-cols-2">
                      {durationFields.map(([key, label]) => (
                        <Field
                          key={key}
                          label={`${label} (minutes)`}
                        >
                          <input
                            required
                            type="number"
                            min="0"
                            max="1440"
                            step="1"
                            value={entry[key]}
                            onChange={(event) =>
                              update(
                                key,
                                Number(event.target.value),
                              )
                            }
                          />

                          <p className="mt-2 text-sm font-medium text-emerald-800">
                            {duration(entry[key])}
                          </p>
                        </Field>
                      ))}
                    </div>
                  </section>
                </>
              )}
            </fieldset>

            <footer className="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-stone-100 bg-[#f8faf6] px-6 py-4">
              <Button
                type="button"
                secondary
                disabled={busy}
                onClick={closeEntry}
              >
                Cancel
              </Button>

              <Button type="submit" disabled={busy}>
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
          <div className="space-y-5 p-6">
            {deleteError && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
              >
                {deleteError}
              </div>
            )}

            <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
              <p className="font-semibold text-stone-900">
                {employees.find(
                  (employee) =>
                    employee.id === deleteEntry.employee,
                )?.name || deleteEntry.employee}
              </p>

              <p className="mt-2 text-sm text-stone-600">
                Date: {deleteEntry.date}
              </p>

              <p className="mt-1 text-sm text-stone-600">
                Status: {deleteEntry.status}
              </p>
            </div>

            <p className="text-sm text-stone-700">
              This permanently deletes the attendance entry.
              Recalculate any saved payroll drafts affected by
              this change.
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
              className="rounded-lg bg-red-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete attendance"}
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}