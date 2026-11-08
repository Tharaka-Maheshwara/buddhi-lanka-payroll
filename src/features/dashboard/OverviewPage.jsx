import { useEffect, useState } from "react";

import { useRecords } from "../../shared/hooks/useRecords";
import {
  PageHeader,
  Field,
  Stat,
  Message,
} from "../../shared/ui";
import { duration } from "../../shared/utils/format";

const PRESENT_STATUSES = new Set([
  "Present",
  "Partial day",
  "Half day",
  "Holiday work",
]);

const ABSENT_STATUSES = new Set([
  "Paid leave",
  "Sick leave",
  "No pay",
]);

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

function displayDate(value) {
  const [year, month, day] = value.split("-").map(Number);

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function getCategory(record) {
  if (!record) return "unrecorded";

  if (PRESENT_STATUSES.has(record.status)) {
    return "present";
  }

  if (ABSENT_STATUSES.has(record.status)) {
    return "absent";
  }

  return "unrecorded";
}

function statusLabel(record) {
  if (!record) return "Not recorded";

  if (record.status === "Partial day") {
    return "Half day";
  }

  return record.status || "Not recorded";
}

export function OverviewPage() {
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

  const [today, setToday] = useState(getTodayDate);
  const [selectedDate, setSelectedDate] = useState(getTodayDate);
  const [followToday, setFollowToday] = useState(true);
  const [filter, setFilter] = useState("all");

  // Keep today's view on the correct Colombo date after midnight.
  useEffect(() => {
    function updateToday() {
      const nextToday = getTodayDate();

      setToday(nextToday);

      if (followToday) {
        setSelectedDate(nextToday);
      }
    }

    updateToday();

    const timer = window.setInterval(updateToday, 30000);

    return () => window.clearInterval(timer);
  }, [followToday]);

  const loading = employeesLoading || attendanceLoading;
  const error = employeesError || attendanceError;

  // One summary row per employee, even if duplicate records exist.
  const recordsByEmployee = new Map();

  for (const record of attendance) {
    if (record.date === selectedDate) {
      recordsByEmployee.set(record.employee, record);
    }
  }

  const employeeRows = employees
    .map((employee) => {
      const record = recordsByEmployee.get(employee.id);
      const category = getCategory(record);

      const arrivalLate = Math.max(
        0,
        Number(record?.late) || 0,
      );

      return {
        employee,
        record,
        category,
        arrivalLate,
        isLate: category === "present" && arrivalLate > 0,
      };
    })
    .sort((a, b) =>
      String(a.employee.name || "").localeCompare(
        String(b.employee.name || ""),
      ),
    );

  const presentCount = employeeRows.filter(
    (row) => row.category === "present",
  ).length;

  const absentCount = employeeRows.filter(
    (row) => row.category === "absent",
  ).length;

  const lateCount = employeeRows.filter(
    (row) => row.isLate,
  ).length;

  const unrecordedCount = employeeRows.filter(
    (row) => row.category === "unrecorded",
  ).length;

  const visibleRows = employeeRows.filter((row) => {
    if (filter === "all") return true;
    if (filter === "late") return row.isLate;

    return row.category === filter;
  });

  function changeDate(value) {
    if (!value) return;

    setSelectedDate(value);
    setFollowToday(value === getTodayDate());
  }

  function showToday() {
    const currentDate = getTodayDate();

    setToday(currentDate);
    setSelectedDate(currentDate);
    setFollowToday(true);
  }

  const cards = [
    ["Total employees", employees.length],
    ["Present", presentCount],
    ["Absent", absentCount],
    ["Arrived late", lateCount],
    ["Not recorded", unrecordedCount],
  ];

  return (
    <>
      <PageHeader
        title="Daily attendance summary"
        description="View employee attendance for the selected date."
      />

      {error && <Message>{error}</Message>}

      <div className="card mb-6">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-stone-500">
              Attendance date
            </p>

            <h2 className="mt-2 text-xl font-semibold">
              {displayDate(selectedDate)}
            </h2>

            <p className="mt-2 text-sm text-stone-500">
              {selectedDate === today
                ? "Today's attendance"
                : "Attendance for the selected date"}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <Field label="Select date">
              <input
                type="date"
                required
                value={selectedDate}
                onChange={(event) =>
                  changeDate(event.target.value)
                }
              />
            </Field>

            <button
              type="button"
              onClick={showToday}
              className="rounded-lg bg-[#174c3e] px-5 py-3 text-sm font-semibold text-white hover:bg-[#123d34]"
            >
              Today
            </button>
          </div>
        </div>

        <p
          role="status"
          className="mt-5 flex items-center gap-2 text-sm text-stone-600"
        >
          <span
            className={`h-2 w-2 rounded-full ${
              error
                ? "bg-red-500"
                : loading
                  ? "bg-amber-500"
                  : "bg-emerald-500"
            }`}
          />

          {error
            ? "Unable to load attendance."
            : loading
              ? "Loading attendance…"
              : "Updates automatically when attendance changes."}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-5">
        {cards.map(([label, value]) => (
          <Stat
            key={label}
            label={label}
            value={loading || error ? "—" : value}
          />
        ))}
      </div>

      <div className="card">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">
              Employee attendance
            </h2>

            <p className="mt-2 text-sm text-stone-500">
              Late arrivals are included in the present count.
            </p>
          </div>

          <Field label="Show">
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="all">All employees</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="late">Arrived late</option>
              <option value="unrecorded">Not recorded</option>
            </select>
          </Field>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Role</th>
                <th>Attendance type</th>
                <th>In time</th>
                <th>Arrival late</th>
                <th>Out time</th>
              </tr>
            </thead>

            <tbody>
              {!loading &&
                !error &&
                visibleRows.map((row) => {
                  const {
                    employee,
                    record,
                    category,
                    arrivalLate,
                    isLate,
                  } = row;

                  const badgeClass =
                    category === "present"
                      ? isLate
                        ? "bg-amber-100 text-amber-900"
                        : "bg-emerald-100 text-emerald-900"
                      : category === "absent"
                        ? "bg-red-100 text-red-800"
                        : "bg-stone-100 text-stone-600";

                  return (
                    <tr key={employee.id}>
                      <td className="font-medium">
                        {employee.name}
                      </td>

                      <td>{employee.role || "—"}</td>

                      <td>
                        <span
                          className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${badgeClass}`}
                        >
                          {statusLabel(record)}
                        </span>
                      </td>

                      <td className="whitespace-nowrap">
                        {record?.inTime || "—"}
                      </td>

                      <td className="whitespace-nowrap">
                        {category === "present"
                          ? duration(arrivalLate)
                          : "—"}
                      </td>

                      <td className="whitespace-nowrap">
                        {record?.outTime || "—"}
                        {record?.overnight && " (+1)"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {loading ? (
          <p className="py-8 text-sm text-stone-500">
            Loading attendance…
          </p>
        ) : error ? (
          <p className="py-8 text-sm text-red-700">
            Attendance could not be loaded.
          </p>
        ) : !visibleRows.length ? (
          <p className="py-8 text-sm text-stone-500">
            No employees for this selection.
          </p>
        ) : null}

        <p className="mt-5 text-xs leading-relaxed text-stone-500">
          Absent includes Paid leave, Sick leave and No pay.
          Employees without an attendance record are shown as
          Not recorded. Personal leave is not counted as a late
          arrival.
        </p>
      </div>
    </>
  );
}