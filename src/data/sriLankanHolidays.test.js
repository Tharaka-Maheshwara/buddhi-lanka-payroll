import { describe, expect, it } from "vitest";
import {
  getSriLankanHoliday,
  getSriLankanHolidaysForMonth,
} from "./sriLankanHolidays";

describe("Sri Lankan holiday calendar", () => {
  it("finds a configured holiday by date", () => {
    expect(getSriLankanHoliday("2026-02-04")).toEqual({
      date: "2026-02-04",
      name: "National Day",
    });
  });

  it("returns only holidays for the selected month", () => {
    expect(
      getSriLankanHolidaysForMonth("2026-04"),
    ).toHaveLength(6);
  });

  it("returns no holidays for an unconfigured year", () => {
    expect(
      getSriLankanHolidaysForMonth("2027-01"),
    ).toEqual([]);
  });
});
