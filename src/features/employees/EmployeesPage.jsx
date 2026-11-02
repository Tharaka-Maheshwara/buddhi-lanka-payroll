// src/features/employees/EmployeesPage.jsx

import { useState } from "react";
import { useRecords } from "../../shared/hooks/useRecords";
import { Button, Field, PageHeader, Message } from "../../shared/ui";
import { Modal } from "../../shared/ui/Modal";
import { money } from "../../shared/utils/format";

const blank = {
  name: "",
  role: "",
  basic: 30000,
  attendance: 0,
  travel: 0,
  meal: 0,
  bonus: 0,
};

const amountFields = [
  ["basic", "Basic salary"],
  ["attendance", "Attendance allowance"],
  ["travel", "Travelling allowance"],
  ["meal", "Meal allowance"],
  ["bonus", "Production bonus"],
];

export function EmployeesPage() {
  const { records, saveRecord, error, loading } = useRecords("employees");

  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const open = (employee) => {
    setMessage("");
    setFormError("");
    setEditing({ ...employee });
  };

  const close = () => {
    if (busy) return;

    setEditing(null);
    setFormError("");
  };

  const update = (key, value) => {
    setEditing((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  const save = async (event) => {
    event.preventDefault();
    if (busy) return;

    setFormError("");
    setBusy(true);

    try {
      if (!editing.name.trim()) {
        throw new Error("Employee name is required.");
      }

      if (!editing.role.trim()) {
        throw new Error("Employee role is required.");
      }

      for (const [key] of amountFields) {
        if (!Number.isFinite(editing[key]) || editing[key] < 0) {
          throw new Error(
            "Salary and allowance amounts must be zero or greater.",
          );
        }
      }

      await saveRecord({
        ...editing,
        name: editing.name.trim(),
        role: editing.role.trim(),
      });

      setEditing(null);
      setMessage("Employee saved.");
    } catch (error) {
      setFormError(error.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Employee profiles"
        description="Individual salaries and monthly allowances."
        action={
          <Button onClick={() => open(blank)}>+ Add employee</Button>
        }
      />

      {(error || message) && <Message>{error || message}</Message>}

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
              <th>Bonus</th>
              <th />
            </tr>
          </thead>

          <tbody>
            {records.map((employee) => (
              <tr key={employee.id}>
                <td className="font-semibold">{employee.name}</td>
                <td>{employee.role}</td>

                {amountFields.map(([key]) => (
                  <td key={key}>{money(employee[key])}</td>
                ))}

                <td>
                  <button
                    className="text-emerald-800 underline"
                    onClick={() => open(employee)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!records.length && (
          <p className="py-8">
            {loading
              ? "Loading…"
              : "No employees yet. Add your first employee."}
          </p>
        )}
      </div>

      {editing && (
        <Modal
          title={editing.id ? "Edit employee" : "Add employee"}
          description="Enter employee details and monthly amounts in LKR."
          onClose={close}
          busy={busy}
        >
          <form onSubmit={save}>
            <fieldset
              disabled={busy}
              className="m-0 min-w-0 space-y-5 border-0 p-6"
            >
              {formError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
                >
                  {formError}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Employee name">
                  <input
                    autoFocus
                    required
                    maxLength={150}
                    type="text"
                    autoComplete="off"
                    placeholder="Enter full name"
                    value={editing.name}
                    onChange={(event) => update("name", event.target.value)}
                  />
                </Field>

                <Field label="Role">
                  <input
                    required
                    maxLength={100}
                    type="text"
                    placeholder="e.g. Production technician"
                    value={editing.role}
                    onChange={(event) => update("role", event.target.value)}
                  />
                </Field>
              </div>

              <div className="border-t border-stone-100 pt-5">
                <h3 className="mb-4 text-sm font-semibold">
                  Salary and allowances
                </h3>

                <div className="grid gap-4 sm:grid-cols-2">
                  {amountFields.map(([key, label]) => (
                    <Field key={key} label={`${label} (LKR)`}>
                      <input
                        required
                        min="0"
                        max="100000000"
                        step="0.01"
                        type="number"
                        value={editing[key]}
                        onChange={(event) =>
                          update(key, Number(event.target.value))
                        }
                      />
                    </Field>
                  ))}
                </div>
              </div>
            </fieldset>

            <footer className="sticky bottom-0 flex flex-wrap justify-end gap-3 border-t border-stone-100 bg-[#f8faf6] px-6 py-4">
              <Button
                type="button"
                secondary
                disabled={busy}
                onClick={close}
              >
                Cancel
              </Button>

              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save employee"}
              </Button>
            </footer>
          </form>
        </Modal>
      )}
    </>
  );
}