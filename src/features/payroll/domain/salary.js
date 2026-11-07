const BASIC_DAYS = 25;
const ALLOWANCE_DAYS = 26;
const DAY_MINUTES = 480;

const round = (value, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

function amount(value, label) {
  if (
    value === "" ||
    value === null ||
    value === undefined
  ) {
    throw new Error(`Enter ${label}.`);
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`${label} must be zero or greater.`);
  }

  return number;
}

function minutes(value, label) {
  const number = Number(value ?? 0);

  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error(`${label} must be whole positive minutes or zero.`);
  }

  return number;
}

function allowanceDeduction(monthly, days, extraMinutes) {
  const daily = monthly / ALLOWANCE_DAYS;
  const hours = Math.floor(extraMinutes / 60);
  const remainingMinutes = extraMinutes % 60;

  // Round each deduction separately, as in the notebook example.
  return round(
    round(daily * days, 1) +
      round((daily / 8) * hours, 1) +
      round((daily / DAY_MINUTES) * remainingMinutes, 1),
  );
}

export function calculateSalary(employee, records, adjustments = {}) {
  const basic = amount(employee.basic, "basic salary");
  const attendance = amount(
    employee.attendance ?? 0,
    "attendance allowance",
  );
  const travel = amount(employee.travel ?? 0, "travelling allowance");
  const meal = amount(employee.meal ?? 0, "meal allowance");
  const bonus = amount(employee.bonus ?? 0, "production bonus");

  const bonusDeduction = amount(
    adjustments.bonusDeduction ?? 0,
    "production bonus deduction",
  );
  const advance = amount(adjustments.advance ?? 0, "advance");
  const otherDeduction = amount(
    adjustments.otherDeduction ?? 0,
    "other deductions",
  );

  const paid = records.filter(
    (record) => record.status === "Paid leave",
  ).length;

  const sick = records.filter(
    (record) => record.status === "Sick leave",
  ).length;

  const noPay = records.filter(
    (record) => record.status === "No pay",
  ).length;

  const workedRecords = records.filter(
    (record) =>
      !["Paid leave", "Sick leave", "No pay"].includes(record.status),
  );

  const arrivalLate = workedRecords.reduce(
    (total, record) =>
      total + minutes(record.late, "Arrival late time"),
    0,
  );

  const personalLeave = workedRecords.reduce(
    (total, record) =>
      total + minutes(record.leaveDuration, "Personal leave time"),
    0,
  );

  // Optional override includes any approved early departure time.
  const lateMinutes =
    adjustments.lateMinutes === undefined
      ? arrivalLate + personalLeave
      : minutes(adjustments.lateMinutes, "Approved monthly late time");

  const lateDays = Math.floor(lateMinutes / DAY_MINUTES);
  const extraLateMinutes = lateMinutes % DAY_MINUTES;

  const deductionDays = paid + sick + noPay + lateDays;

  // Paid/Sick leave does not reduce basic salary.
  const basicUnpaidMinutes = noPay * DAY_MINUTES + lateMinutes;

  const hourlyRate = basic / BASIC_DAYS / 8;
  const basicDeduction = round(
    (basicUnpaidMinutes / 60) * hourlyRate,
  );

  const otMinutes = workedRecords.reduce(
    (total, record) => total + minutes(record.ot, "OT"),
    0,
  );

  const doubleMinutes = workedRecords.reduce(
    (total, record) => total + minutes(record.double, "Double OT"),
    0,
  );

  const otRate = hourlyRate * 1.5;
  const doubleRate = hourlyRate * 2;

  const otPay = round((otMinutes / 60) * otRate);
  const doublePay = round((doubleMinutes / 60) * doubleRate);

  // The current employee schema does not store employeeType.
  // Employees with an attendance allowance/bonus use the 45k package.
  const is45000Type =
    attendance > 0 || bonus > 0 || basic === 45000;

  const penaltyCount = Math.min(deductionDays, 4);

  const attendancePenalties = [0, 2000, 6000, 12000, 20000];
  const travelPenalties = [0, 500, 1500, 3500, 6000];

  const attendancePenalty = is45000Type
    ? Math.min(attendance, attendancePenalties[penaltyCount])
    : 0;

  const travelPenalty = is45000Type
    ? 0
    : travelPenalties[penaltyCount];

  const mealDeduction = allowanceDeduction(
    meal,
    deductionDays,
    extraLateMinutes,
  );

  const travelDeduction = allowanceDeduction(
    travel,
    deductionDays,
    extraLateMinutes,
  );

  if (bonusDeduction > bonus) {
    throw new Error(
      "Production bonus deduction cannot exceed the production bonus.",
    );
  }

  const earnings = {
    basic: round(Math.max(0, basic - basicDeduction)),
    attendance: round(Math.max(0, attendance - attendancePenalty)),
    travel: round(
      Math.max(0, travel - travelDeduction - travelPenalty),
    ),
    meal: round(Math.max(0, meal - mealDeduction)),
    bonus: round(bonus - bonusDeduction),
    ot: otPay,
    double: doublePay,
  };

  const gross = round(
    Object.values(earnings).reduce((total, value) => total + value, 0),
  );

  const payable = round(gross - advance - otherDeduction);

  if (payable < 0) {
    throw new Error(
      "Advance and other deductions exceed the available salary.",
    );
  }

  return {
    earnings,
    gross,
    payable,
    counts: {
      paid,
      sick,
      noPay,
      lateDays,
      deductionDays,
    },
    time: {
      arrivalLate,
      personalLeave,
      lateMinutes,
      extraLateMinutes,
      otMinutes,
      doubleMinutes,
    },
    rates: {
      daily: basic / BASIC_DAYS,
      hourly: hourlyRate,
      ot: otRate,
      double: doubleRate,
    },
    deductions: {
      basic: basicDeduction,
      attendance: attendancePenalty,
      meal: mealDeduction,
      travel: travelDeduction,
      travelPenalty,
      bonus: bonusDeduction,
      advance,
      other: otherDeduction,
    },
  };
}