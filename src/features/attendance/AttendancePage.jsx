import { useState } from "react";
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
import { calculateClock, validateDurations } from "./domain/time";

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

export function AttendancePage() {
  const { period } = usePeriod();

  const {
    records,
    saveRecord,
    error,
  } = useRecords("attendance");

  const { records: employees } = useRecords("employees");

  const [filter, setFilter] = useState("");
  const [entry, setEntry] = useState(null);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = records
    .filter(
      (record) =>
        record.date.startsWith(period) &&
        (!filter || record.employee === filter),
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  let clock = null;
  let clockError = "";

  if (entry && (entry.inTime || entry.outTime)) {
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

  const openEntry = (record = null) => {
    setMessage("");
    setFormError("");

    setEntry(
      record
        ? { ...blank, ...record }
        : {
            ...blank,
            employee: filter || employees[0]?.id || "",
            date: `${period}-01`,
          },
    );
  };

  const closeEntry = () => {
    if (busy) return;

    setEntry(null);
    setFormError("");
  };

  const save = async (event) => {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setFormError("");

    try {
      validateDurations(entry);

      if (!entry.employee || !entry.date) {
        throw new Error("Select an employee and date.");
      }

      const duplicate = records.some(
        (record) =>
          record.id !== entry.id &&
          record.employee === entry.employee &&
          record.date === entry.date,
      );

      if (duplicate) {
        throw new Error(
          "An entry already exists for this employee and date.",
        );
      }

      if (clockError) {
        throw new Error(clockError);
      }

      if (!clock && (entry.leaveOut || entry.leaveIn)) {
        throw new Error(
          "Enter shift In and Out times before personal leave.",
        );
      }

      const approvedTime = entry.regular + entry.ot + entry.double;

      if (clock && approvedTime > clock.worked) {
        throw new Error(
          "Approved worked time exceeds time on site after leave and breaks.",
        );
      }

      if (
        entry.status === "No pay" &&
        (approvedTime > 0 || entry.unpaid <= 0)
      ) {
        throw new Error(
          "For a no-pay day, enter zero worked time and specify unpaid minutes.",
        );
      }

      await saveRecord({
        ...entry,
        leaveDuration: clock?.leave || 0,
      });

      setEntry(null);
      setMessage("Attendance saved.");
    } catch (error) {
      setFormError(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Attendance sheet"
        description="Arrival, personal leave, departure and approved overtime."
        action={
          <Button
            disabled={!employees.length}
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
        {["regular", "late", "ot", "double"].map((key, index) => (
          <Stat
            key={key}
            label={
              ["Regular hours", "Late time", "OT", "Double OT"][index]
            }
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
              {[
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
                "",
              ].map((heading, index) => (
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
                <td>{duration(record.late)}</td>
                <td>{record.leaveOut || "—"}</td>
                <td>{record.leaveIn || "—"}</td>
                <td>{duration(record.leaveDuration)}</td>

                <td>
                  {record.outTime || "—"}
                  {record.overnight && " (+1)"}
                </td>

                {["regular", "ot", "double"].map((key) => (
                  <td key={key}>{duration(record[key])}</td>
                ))}

                <td>{record.status}</td>
                <td>{duration(record.unpaid)}</td>

                <td>
                  <button
                    className="text-emerald-800 underline"
                    onClick={() => openEntry(record)}
                  >
                    Edit
                  </button>
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

      <p className="mt-4 text-sm">
        Approved durations use minutes on entry and HH:MM in the
        register. Enter total unpaid salary time once.
      </p>

      {entry && (
        <Modal
          title={
            entry.id
              ? "Edit attendance entry"
              : "Daily attendance entry"
          }
          description="Record employee attendance, personal leave and approved overtime."
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
                  <Field label="Employee">
                    <select
                      required
                      value={entry.employee}
                      onChange={(event) =>
                        update("employee", event.target.value)
                      }
                    >
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
                        update("status", event.target.value)
                      }
                    >
                      {statuses.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </section>

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
                          update(key, event.currentTarget.value)
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
                  </Field>
                </div>

                <div
                  aria-live="polite"
                  className="mt-4 rounded-lg border border-stone-200 bg-[#f3f7ee] p-4 text-sm"
                >
                  {clockError ? (
                    <p className="text-red-700">{clockError}</p>
                  ) : clock ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs">
                          Personal leave duration
                        </p>
                        <strong>{duration(clock.leave)}</strong>
                      </div>

                      <div>
                        <p className="text-xs">
                          Time after leave and breaks
                        </p>
                        <strong>{duration(clock.worked)}</strong>
                      </div>
                    </div>
                  ) : (
                    <p>
                      Enter In and Out times to calculate time on
                      site. Clock times are optional for historical
                      entries.
                    </p>
                  )}
                </div>
              </section>

              <section className="border-t border-stone-100 pt-5">
                <h3 className="mb-2 text-sm font-semibold">
                  Approved durations
                </h3>

                <p className="mb-4 text-xs">
                  Enter whole minutes. For example, 1 hour 30
                  minutes = 90.
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  {durationFields.map(([key, label]) => (
                    <Field key={key} label={`${label} (minutes)`}>
                      <input
                        required
                        type="number"
                        min="0"
                        max="1440"
                        step="1"
                        value={entry[key]}
                        onChange={(event) =>
                          update(key, Number(event.target.value))
                        }
                      />
                    </Field>
                  ))}
                </div>
              </section>
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
    </>
  );
}