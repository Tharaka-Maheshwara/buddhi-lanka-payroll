import { describe, expect, it } from "vitest";
import { calculateSalary } from "./salary";

describe("attendance-based salary calculation", () => {
  it("ignores holiday work late time and pays worked time as double OT", () => {
    const result = calculateSalary(
      {
        id: "employee-1",
        basic: 30000,
        attendance: 0,
        travel: 0,
        meal: 0,
        bonus: 0,
      },
      [
        {
          employee: "employee-1",
          date: "2026-11-14",
          status: "Holiday work",
          regular: 0,
          late: 120,
          leaveDuration: 60,
          ot: 0,
          double: 450,
        },
      ],
    );

    expect(result.time.arrivalLate).toBe(0);
    expect(result.time.personalLeave).toBe(0);
    expect(result.time.lateMinutes).toBe(0);
    expect(result.time.doubleMinutes).toBe(450);
    expect(result.earnings.double).toBeGreaterThan(0);
  });
});
