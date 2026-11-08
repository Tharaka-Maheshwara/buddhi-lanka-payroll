const BASIC_DAYS = 25;
const ALLOWANCE_DAYS = 26;
const DAY_MINUTES = 480;
const EPF_RATE = 0.08;

const NON_WORKING_STATUSES = [
  "Paid leave",
  "Sick leave",
  "No pay",
];

const WORKING_STATUSES = [
  "Present",
  "Partial day",
  "Holiday work",
];

function round(value, digits = 2) {
  const factor = 10 ** digits;

  return Math.round(
    (value + Number.EPSILON) * factor,
  ) / factor;
}

function amount(value, label) {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ""
  ) {
    throw new Error(`Enter ${label}.`);
  }

  const number = Number(value);

  if (!Number.isFinite(number) || number < 0) {
    throw new Error(
      `${label} must be zero or greater.`,
    );
  }

  return number;
}

function minutes(value, label) {
  const number = Number(value ?? 0);

  if (
    !Number.isSafeInteger(number) ||
    number < 0 ||
    number > 1440
  ) {
    throw new Error(
      `${label} must be whole minutes between 0 and 1440.`,
    );
  }

  return number;
}

function validDate(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
  ) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);

  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function lateAllowanceDeduction(
  monthlyAmount,
  lateMinutes,
) {
  const daily = monthlyAmount / ALLOWANCE_DAYS;

  const fullDays = Math.floor(
    lateMinutes / DAY_MINUTES,
  );

  const remaining = lateMinutes % DAY_MINUTES;
  const hours = Math.floor(remaining / 60);
  const remainingMinutes = remaining % 60;

  // Round each part separately, following the notebook method.
  return round(
    round(daily * fullDays, 1) +
      round((daily / 8) * hours, 1) +
      round(
        (daily / DAY_MINUTES) * remainingMinutes,
        1,
      ),
  );
}

export function calculateSalary(
  employee,
  records,
  adjustments = {},
) {
  if (!Array.isArray(records)) {
    throw new Error(
      "Attendance records must be a list.",
    );
  }

  if (!records.length) {
    throw new Error(
      "Add attendance records before calculating salary.",
    );
  }

  const monthlyBasic = amount(
    employee.basic,
    "basic salary",
  );

  const monthlyAttendance = amount(
    employee.attendance ?? 0,
    "attendance allowance",
  );

  const monthlyTravel = amount(
    employee.travel ?? 0,
    "travelling allowance",
  );

  const monthlyMeal = amount(
    employee.meal ?? 0,
    "meal allowance",
  );

  const monthlyBonus = amount(
    employee.bonus ?? 0,
    "production bonus",
  );

  const bonusDeduction = amount(
    adjustments.bonusDeduction ?? 0,
    "production bonus deduction",
  );

  const advance = amount(
    adjustments.advance ?? 0,
    "advance",
  );

  const otherDeduction = amount(
    adjustments.otherDeduction ?? 0,
    "other deductions",
  );

  const dailyBasicRate =
    monthlyBasic / BASIC_DAYS;

  const hourlyRate = dailyBasicRate / 8;
  const minuteRate = hourlyRate / 60;

  const otRate = hourlyRate * 1.5;
  const doubleRate = hourlyRate * 2;

  const dailyTravelRate =
    monthlyTravel / ALLOWANCE_DAYS;

  const dailyMealRate =
    monthlyMeal / ALLOWANCE_DAYS;

  const dailyBonusRate =
    monthlyBonus / ALLOWANCE_DAYS;

  let paid = 0;
  let sick = 0;
  let noPay = 0;

  let attendedDays = 0;
  let holidayDays = 0;

  let regularMinutes = 0;

  let arrivalLate = 0;
  let personalLeave = 0;

  let basicLateMinutes = 0;
  let allowanceLateMinutes = 0;

  let otMinutes = 0;
  let doubleMinutes = 0;

  let recordPeriod = null;

  const seenDates = new Set();

  for (const record of records) {
    if (!validDate(record.date)) {
      throw new Error(
        "An attendance record has an invalid date.",
      );
    }

    if (
      record.employee !== undefined &&
      employee.id !== undefined &&
      record.employee !== employee.id
    ) {
      throw new Error(
        "Attendance records contain another employee.",
      );
    }

    const period = record.date.slice(0, 7);

    if (recordPeriod === null) {
      recordPeriod = period;
    } else if (period !== recordPeriod) {
      throw new Error(
        "Calculate one pay period at a time.",
      );
    }

    if (seenDates.has(record.date)) {
      throw new Error(
        `Duplicate attendance found for ${record.date}.`,
      );
    }

    seenDates.add(record.date);

    if (
      !NON_WORKING_STATUSES.includes(record.status) &&
      !WORKING_STATUSES.includes(record.status)
    ) {
      throw new Error(
        `Invalid attendance type for ${record.date}.`,
      );
    }

    if (record.status === "Paid leave") {
      paid++;
      continue;
    }

    if (record.status === "Sick leave") {
      sick++;
      continue;
    }

    if (record.status === "No pay") {
      noPay++;
      continue;
    }

    const regular = minutes(
      record.regular,
      "Regular worked time",
    );

    const ot = minutes(
      record.ot,
      "OT",
    );

    const double = minutes(
      record.double,
      "Double OT",
    );

    const late = minutes(
      record.late,
      "Arrival late",
    );

    const leave = minutes(
      record.leaveDuration,
      "Personal leave",
    );

    if (regular + ot + double > 1440) {
      throw new Error(
        `Worked time exceeds 24 hours on ${record.date}.`,
      );
    }

    arrivalLate += late;
    personalLeave += leave;

    if (record.status === "Holiday work") {
      holidayDays++;

      // The attendance calculator stores all holiday worked
      // minutes in Double OT.
      if (regular !== 0 || ot !== 0) {
        throw new Error(
          `Edit and save Holiday work on ${record.date} so its worked time is stored as Double OT.`,
        );
      }

      doubleMinutes += double;

      // Holiday lateness/personal leave does not reduce monthly
      // Basic or create an absence penalty.
      // Worked holiday minutes already exclude personal leave.
      continue;
    }

    attendedDays++;

    regularMinutes += regular;
    otMinutes += ot;
    doubleMinutes += double;

    basicLateMinutes += late + leave;
    allowanceLateMinutes += late + leave;
  }

  /*
   * MONTHLY BASIC
   *
   * Start from the full monthly Basic.
   * Missing attendance dates are never automatically No-pay.
   * Paid/Sick leave does not reduce Basic.
   * Non-working Sundays/Poya need no entry.
   * Saturday's shorter regular schedule does not itself
   * create a Basic deduction.
   */

  const noPayMinutes = noPay * DAY_MINUTES;

  const basicUnpaidMinutes =
    noPayMinutes + basicLateMinutes;

  const calculatedBasicDeduction = round(
    basicUnpaidMinutes * minuteRate,
  );

  const basicDeduction = Math.min(
    monthlyBasic,
    calculatedBasicDeduction,
  );

  const adjustedBasic = round(
    monthlyBasic - basicDeduction,
  );

  const lateDays = Math.floor(
    basicLateMinutes / DAY_MINUTES,
  );

  const extraLateMinutes =
    basicLateMinutes % DAY_MINUTES;

  const deductionDays =
    paid + sick + noPay + lateDays;

  /*
   * OT
   *
   * Holiday work receives Double OT in addition to
   * the monthly Basic entitlement.
   */

  const otPay = round(
    (otMinutes / 60) * otRate,
  );

  const doublePay = round(
    (doubleMinutes / 60) * doubleRate,
  );

  /*
   * ALLOWANCES
   *
   * Preserve the previously selected attendance-based method:
   * Meal, Travel and Production bonus accrue for recorded
   * Present/Partial day entries.
   *
   * Paid/Sick/No-pay/Holiday work entries do not add these
   * daily allowances in this version.
   */

  const travelBeforeDeductions = round(
    dailyTravelRate * attendedDays,
  );

  const mealBeforeDeductions = round(
    dailyMealRate * attendedDays,
  );

  const travelDeduction =
    lateAllowanceDeduction(
      monthlyTravel,
      allowanceLateMinutes,
    );

  const mealDeduction =
    lateAllowanceDeduction(
      monthlyMeal,
      allowanceLateMinutes,
    );

  // Existing employee schema does not store employeeType.
  const is45000Type =
    monthlyAttendance > 0 ||
    monthlyBonus > 0 ||
    monthlyBasic === 45000;

  const travelPenalties = [
    0,
    500,
    1500,
    3500,
    6000,
  ];

  const travelPenalty = is45000Type
    ? 0
    : travelPenalties[
        Math.min(deductionDays, 4)
      ];

  const earnedBonus = round(
    dailyBonusRate * attendedDays,
  );

  if (bonusDeduction > earnedBonus) {
    throw new Error(
      `Production bonus deduction cannot exceed the earned bonus of LKR ${earnedBonus.toFixed(2)}.`,
    );
  }

  const earnings = {
    basic: adjustedBasic,

    // Attendance allowance is excluded as requested.
    attendance: 0,

    travel: round(
      Math.max(
        0,
        travelBeforeDeductions -
          travelDeduction -
          travelPenalty,
      ),
    ),

    meal: round(
      Math.max(
        0,
        mealBeforeDeductions -
          mealDeduction,
      ),
    ),

    bonus: round(
      earnedBonus - bonusDeduction,
    ),

    ot: otPay,

    double: doublePay,
  };

  const gross = round(
    Object.values(earnings).reduce(
      (total, value) => total + value,
      0,
    ),
  );

  // EPF base follows the supplied worksheet.
  const epfBase = adjustedBasic;
  const epf = round(epfBase * EPF_RATE);

  const totalDeductions = round(
    epf + advance + otherDeduction,
  );

  const payable = round(
    gross - totalDeductions,
  );

  if (payable < 0) {
    throw new Error(
      "EPF, advance and other deductions exceed the available salary.",
    );
  }

  return {
    period: recordPeriod,

    calculationMode: "monthly-basic-preview",

    earnings,
    gross,
    payable,
    totalDeductions,

    epf: {
      rate: EPF_RATE,
      base: epfBase,
      amount: epf,
    },

    counts: {
      paid,
      sick,
      noPay,
      attendedDays,
      holidayDays,
      recordedDays: records.length,
      lateDays,
      deductionDays,
    },

    time: {
      regularMinutes,
      arrivalLate,
      personalLeave,

      // Salary-relevant late excludes optional holiday work.
      lateMinutes: basicLateMinutes,

      extraLateMinutes,
      noPayMinutes,
      basicUnpaidMinutes,
      otMinutes,
      doubleMinutes,
    },

    rates: {
      daily: dailyBasicRate,
      hourly: hourlyRate,
      ot: otRate,
      double: doubleRate,
      travelDaily: dailyTravelRate,
      mealDaily: dailyMealRate,
      bonusDaily: dailyBonusRate,
    },

    deductions: {
      basic: basicDeduction,
      attendance: 0,
      meal: mealDeduction,
      travel: travelDeduction,
      travelPenalty,
      bonus: bonusDeduction,
      epf,
      advance,
      other: otherDeduction,
    },

    earnedBeforeDeductions: {
      basic: monthlyBasic,
      travel: travelBeforeDeductions,
      meal: mealBeforeDeductions,
      bonus: earnedBonus,
    },
  };
}