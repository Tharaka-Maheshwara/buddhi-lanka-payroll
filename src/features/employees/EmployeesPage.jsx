import { useState } from "react";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";

import { db } from "../../lib/firebase/client";
import { useRecords } from "../../shared/hooks/useRecords";

import {
  Button,
  Field,
  PageHeader,
  Message,
} from "../../shared/ui";

import { Modal } from "../../shared/ui/Modal";
import { money } from "../../shared/utils/format";

const blank = {
  name: "",
  role: "",
  basic: 0,
  attendance: 0,
  travel: 0,
  meal: 0,
  bonus: 0,
  epfEnabled: false,
};

const employeeTypes = {
  "45000": {
    label: "Basic Allowance 45,000",
    amounts: {
      basic: 45000,
      attendance: 20000,
      travel: 10000,
      meal: 7000,
      bonus: 15000,
    },
  },

  "30000": {
    label: "Basic Allowance 30,000",
    amounts: {
      basic: 30000,
      attendance: 0,
      travel: 6000,
      meal: 7000,
      bonus: 0,
    },
  },
};

const amountFields = [
  ["basic", "Basic salary"],
  ["attendance", "Attendance allowance"],
  ["travel", "Travelling allowance"],
  ["meal", "Meal allowance"],
  ["bonus", "Production bonus"],
];

function inferEmployeeType(employee) {
  if (!employee?.id) return "";

  if (
    Number(employee.attendance) > 0 ||
    Number(employee.bonus) > 0 ||
    Number(employee.basic) === 45000
  ) {
    return "45000";
  }

  return "30000";
}

export function EmployeesPage() {
  const {
    records,
    saveRecord,
    error,
    loading,
  } = useRecords("employees");

  const [editing, setEditing] = useState(null);
  const [employeeType, setEmployeeType] = useState("");
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteEmployee, setDeleteEmployee] =
    useState(null);

  const [deleteError, setDeleteError] = useState("");
  const [deleting, setDeleting] = useState(false);

  const busy = saving || deleting;

  const visibleAmountFields = amountFields.filter(
    ([key]) =>
      employeeType !== "30000" ||
      (key !== "attendance" && key !== "bonus"),
  );

  function open(employee = null) {
    if (
      busy ||
      loading ||
      error ||
      deleteEmployee
    ) {
      return;
    }

    setMessage("");
    setFormError("");

    setEmployeeType(
      inferEmployeeType(employee),
    );

    setEditing({
      ...blank,
      ...(employee || {}),
      epfEnabled: employee?.epfEnabled === true,
    });
  }

  function close() {
    if (saving) return;

    setEditing(null);
    setEmployeeType("");
    setFormError("");
  }

  function update(key, value) {
    if (saving || !editing) return;

    setFormError("");

    setEditing((previous) => ({
      ...previous,
      [key]: value,
    }));
  }

  function changeEmployeeType(value) {
    if (saving) return;

    setEmployeeType(value);
    setFormError("");

    const amounts = employeeTypes[value]?.amounts || {
      basic: 0,
      attendance: 0,
      travel: 0,
      meal: 0,
      bonus: 0,
    };

    // Preserve the EPF checkbox when changing salary package.
    setEditing((previous) => ({
      ...previous,
      ...amounts,
    }));
  }

  async function save(event) {
    event.preventDefault();

    if (busy || !editing) return;

    setFormError("");
    setSaving(true);

    try {
      const name = editing.name.trim();
      const role = editing.role.trim();

      if (!name) {
        throw new Error(
          "Employee name is required.",
        );
      }

      if (!role) {
        throw new Error(
          "Employee role is required.",
        );
      }

      if (!employeeTypes[employeeType]) {
        throw new Error(
          "Select an employee type.",
        );
      }

      const amounts = {};

      for (const [key, label] of amountFields) {
        const excluded =
          employeeType === "30000" &&
          (key === "attendance" || key === "bonus");

        const value = excluded ? 0 : editing[key];

        if (
          value === null ||
          value === undefined ||
          String(value).trim() === ""
        ) {
          throw new Error(
            `Enter ${label.toLowerCase()}.`,
          );
        }

        const amount = Number(value);

        if (
          !Number.isFinite(amount) ||
          amount < 0 ||
          amount > 100000000
        ) {
          throw new Error(
            `${label} must be between 0 and 100,000,000.`,
          );
        }

        amounts[key] = amount;
      }

      const employee = {
        name,
        role,
        ...amounts,

        // Always store an actual Boolean.
        epfEnabled: editing.epfEnabled === true,
      };

      if (editing.id) {
        employee.id = editing.id;
      }

      await saveRecord(employee);

      setEditing(null);
      setEmployeeType("");
      setMessage(
        "Employee saved successfully.",
      );
    } catch (failure) {
      setFormError(
        failure.message || "Unable to save employee.",
      );
    } finally {
      setSaving(false);
    }
  }

  function openDelete(employee) {
    if (
      busy ||
      editing ||
      loading ||
      error
    ) {
      return;
    }

    setMessage("");
    setDeleteError("");
    setDeleteEmployee(employee);
  }

  function closeDelete() {
    if (deleting) return;

    setDeleteEmployee(null);
    setDeleteError("");
  }

  async function confirmDelete() {
    if (busy || !deleteEmployee?.id) return;

    setDeleting(true);
    setDeleteError("");

    try {
      if (!db) {
        throw new Error(
          "Firebase is not configured.",
        );
      }

      // Preserve the existing deletion restriction.
      const attendanceSnapshot = await getDocs(
        query(
          collection(db, "attendance"),
          where(
            "employee",
            "==",
            deleteEmployee.id,
          ),
          limit(1),
        ),
      );

      if (!attendanceSnapshot.empty) {
        throw new Error(
          "This employee has attendance records and cannot be deleted.",
        );
      }

      await deleteDoc(
        doc(db, "employees", deleteEmployee.id),
      );

      setMessage(
        `${deleteEmployee.name} deleted successfully.`,
      );

      setDeleteEmployee(null);
    } catch (failure) {
      setDeleteError(
        failure.code === "permission-denied"
          ? "Permission denied. Check the published Firestore rules."
          : failure.message || "Unable to delete employee.",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Employee profiles"
        description="Individual salaries and monthly allowances."
        action={
          <Button
            type="button"
            disabled={
              busy ||
              loading ||
              Boolean(error)
            }
            onClick={() => open()}
          >
            + Add employee
          </Button>
        }
      />

      {(error || message) && (
        <Message>{error || message}</Message>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th>Employee</th>
              <th>Role</th>
              <th>Basic salary</th>
              <th>Attendance</th>
              <th>Travel</th>
              <th>Meal</th>
              <th>Bonus</th>
              <th>Employee EPF</th>
              <th>Actions</th>
            </tr>
          </thead>

          <tbody>
            {records.map((employee) => (
              <tr key={employee.id}>
                <td className="font-semibold">
                  {employee.name}
                </td>

                <td>{employee.role}</td>

                {amountFields.map(([key]) => (
                  <td
                    key={key}
                    className="whitespace-nowrap"
                  >
                    {money(employee[key] || 0)}
                  </td>
                ))}

                <td>
                  <span
                    className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${
                      employee.epfEnabled === true
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-stone-100 text-stone-600"
                    }`}
                  >
                    {employee.epfEnabled === true
                      ? "8% enabled"
                      : "Not selected"}
                  </span>
                </td>

                <td>
                  <div className="flex items-center gap-4 whitespace-nowrap">
                    <button
                      type="button"
                      disabled={
                        busy ||
                        loading ||
                        Boolean(error)
                      }
                      onClick={() => open(employee)}
                      className="font-medium text-emerald-800 underline disabled:opacity-50"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      disabled={
                        busy ||
                        loading ||
                        Boolean(error)
                      }
                      onClick={() =>
                        openDelete(employee)
                      }
                      className="font-medium text-red-600 underline disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!records.length && (
          <p className="py-8">
            {loading
              ? "Loading…"
              : error
                ? "Unable to load employees."
                : "No employees yet. Add your first employee."}
          </p>
        )}
      </div>

      {editing && (
        <Modal
          title={
            editing.id
              ? "Edit employee"
              : "Add employee"
          }
          description="Enter employee details and select a salary package."
          onClose={close}
          busy={saving}
        >
          <form onSubmit={save}>
            <fieldset
              disabled={saving}
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
                    <input
                      autoFocus
                      required
                      type="text"
                      maxLength={150}
                      autoComplete="off"
                      placeholder="Enter full name"
                      value={editing.name}
                      onChange={(event) =>
                        update(
                          "name",
                          event.target.value,
                        )
                      }
                    />
                  </Field>

                  <Field label="Role">
                    <input
                      required
                      type="text"
                      maxLength={100}
                      placeholder="Enter employee role"
                      value={editing.role}
                      onChange={(event) =>
                        update(
                          "role",
                          event.target.value,
                        )
                      }
                    />
                  </Field>

                  <div className="sm:col-span-2">
                    <Field label="Employee type">
                      <select
                        required
                        value={employeeType}
                        onChange={(event) =>
                          changeEmployeeType(
                            event.target.value,
                          )
                        }
                      >
                        <option value="" disabled>
                          Select employee type
                        </option>

                        {Object.entries(employeeTypes).map(
                          ([value, type]) => (
                            <option
                              key={value}
                              value={value}
                            >
                              {type.label}
                            </option>
                          ),
                        )}
                      </select>
                    </Field>
                  </div>
                </div>
              </section>

              {!employeeType && (
                <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                  Select an employee type to display salary
                  and allowances.
                </p>
              )}

              {employeeType && (
                <section className="border-t border-stone-100 pt-5">
                  <h3 className="mb-2 text-sm font-semibold">
                    Salary and allowances
                  </h3>

                  <p className="mb-5 text-sm text-stone-500">
                    Amounts are filled from the selected
                    employee type. You can change them
                    before saving.
                  </p>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {visibleAmountFields.map(
                      ([key, label]) => (
                        <Field
                          key={key}
                          label={`${label} (LKR)`}
                        >
                          <input
                            required
                            type="number"
                            min="0"
                            max="100000000"
                            step="0.01"
                            value={editing[key]}
                            onChange={(event) =>
                              update(
                                key,
                                event.target.value,
                              )
                            }
                          />
                        </Field>
                      ),
                    )}
                  </div>

                  {employeeType === "30000" && (
                    <p className="mt-4 rounded-lg bg-stone-50 p-3 text-sm text-stone-600">
                      Attendance allowance and production
                      bonus do not apply to this employee
                      type.
                    </p>
                  )}
                </section>
              )}

              <section className="border-t border-stone-100 pt-5">
                <label
                  htmlFor="employee-epf-enabled"
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4"
                >
                  <input
                    id="employee-epf-enabled"
                    type="checkbox"
                    checked={
                      editing.epfEnabled === true
                    }
                    disabled={saving}
                    onChange={(event) =>
                      update(
                        "epfEnabled",
                        event.target.checked,
                      )
                    }
                    className="mt-1 h-5 w-5 shrink-0 accent-emerald-800"
                    style={{ width: 20 }}
                  />

                  <span>
                    <span className="block text-sm font-semibold">
                      Deduct Employee EPF (8%)
                    </span>

                    <span className="mt-1 block text-xs leading-relaxed text-stone-500">
                      Tick to deduct 8% from Basic after
                      deductions. Leave unticked for no
                      employee EPF deduction.
                    </span>
                  </span>
                </label>
              </section>
            </fieldset>

            <footer className="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-stone-100 bg-[#f8faf6] px-6 py-4">
              <Button
                type="button"
                secondary
                disabled={saving}
                onClick={close}
              >
                Cancel
              </Button>

              <Button
                type="submit"
                disabled={
                  saving || !employeeType
                }
              >
                {saving
                  ? "Saving…"
                  : "Save employee"}
              </Button>
            </footer>
          </form>
        </Modal>
      )}

      {deleteEmployee && (
        <Modal
          title="Delete employee"
          description="Confirm the employee profile you want to delete."
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
              <p className="text-lg font-semibold">
                {deleteEmployee.name}
              </p>

              <p className="mt-1 text-sm text-stone-600">
                {deleteEmployee.role}
              </p>

              <p className="mt-3 text-sm">
                Basic salary:{" "}
                {money(deleteEmployee.basic)}
              </p>
            </div>

            <p className="text-sm text-stone-600">
              This permanently deletes the employee
              profile. Existing payroll drafts will
              remain. Employees with attendance records
              cannot be deleted through this page.
            </p>
          </div>

          <footer className="flex flex-wrap justify-end gap-3 border-t border-stone-100 bg-[#f8faf6] px-6 py-4">
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
              className="rounded-xl bg-red-600 px-5 py-3 font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting
                ? "Deleting…"
                : "Delete employee"}
            </button>
          </footer>
        </Modal>
      )}
    </>
  );
}