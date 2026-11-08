const BASIC_DAYS = 25;
const ALLOWANCE_DAYS = 26;
const DAY_MINUTES = 480;
const EPF_RATE = 0.08;

const WORKING_STATUSES = new Set([
  "Present",
  "Partial day",
  "Half day",
  "Holiday work",
]);

const LEAVE_STATUSES = new Set([
  "Paid leave",
  "Sick leave",
  "No pay",
]);

function round(value) {
  return Math.round(
    (value + Number.EPSILON) * 100,
  ) / 100;
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

function calculateAllowance({
  monthlyAmount,
  monthlyMode,
  attendedDays,
  lateMinutes,
  leaveDays = 0,
  penalty = 0,
}) {
  const dailyRate = monthlyAmount / ALLOWANCE_DAYS;
  const minuteRate = dailyRate / DAY_MINUTES;

  const before = monthlyMode
    ? monthlyAmount
    : dailyRate * attendedDays;

  // Keep full precision until the resulting amounts are returned.
  const standardRequested =
    lateMinutes * minuteRate +
    (monthlyMode ? leaveDays * dailyRate : 0);

  const standardDeduction = Math.min(
    before,
    standardRequested,
  );

  const afterStandard = Math.max(
    0,
    before - standardDeduction,
  );

  const appliedPenalty = Math.min(
    afterStandard,
    penalty,
  );

  return {
    before,
    dailyRate,
    minuteRate,
    standardDeduction,
    penalty: appliedPenalty,
    after: Math.max(0, afterStandard - appliedPenalty),
  };
}

export function calculateSalary(
  employee,
  records,
  adjustments = {},
) {
  if (!employee || typeof employee !== "object") {
    throw new Error("Select a valid employee.");
  }

  if (!Array.isArray(records) || !records.length) {
    throw new Error(
      "Add attendance records before calculating salary.",
    );
  }

  // Default to recorded attendance to avoid paying a full
  // monthly Basic for a single recorded day.
  const mode = adjustments.mode ?? "recorded";

  if (!["recorded", "monthly"].includes(mode)) {
    throw new Error("Select a valid calculation mode.");
  }

  const monthlyMode = mode === "monthly";

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

  const manualBonusDeduction = amount(
    adjustments.bonusDeduction ?? 0,
    "production bonus deduction",
  );

  const advance = amount(
    adjustments.advance ?? 0,
    "advance",
  );

  const other = amount(
    adjustments.otherDeduction ?? 0,
    "other deductions",
  );

  const basicDailyRate = monthlyBasic / BASIC_DAYS;
  const basicHourlyRate = basicDailyRate / 8;
  const basicMinuteRate = basicHourlyRate / 60;

  const otMinuteRate = basicMinuteRate * 1.5;
  const doubleMinuteRate = basicMinuteRate * 2;

  const is45000Type =
    monthlyAttendance > 0 ||
    monthlyBonus > 0 ||
    monthlyBasic === 45000;

  let period = null;
  let paid = 0;
  let sick = 0;
  let noPay = 0;
  let attendedDays = 0;
  let holidayDays = 0;

  let regularMinutes = 0;
  let arrivalLate = 0;
  let personalLeave = 0;
  let lateMinutes = 0;
  let otMinutes = 0;
  let doubleMinutes = 0;

  const seenDates = new Set();

  for (const record of records) {
    if (!record || !validDate(record.date)) {
      throw new Error(
        "An attendance record has an invalid date.",
      );
    }

    if (
      employee.id !== undefined &&
      record.employee !== employee.id
    ) {
      throw new Error(
        "Attendance records contain another employee.",
      );
    }

    const recordPeriod = record.date.slice(0, 7);

    if (period === null) {
      period = recordPeriod;
    } else if (period !== recordPeriod) {
      throw new Error(
        "Calculate one month at a time.",
      );
    }

    if (seenDates.has(record.date)) {
      throw new Error(
        `Duplicate attendance found for ${record.date}.`,
      );
    }

    seenDates.add(record.date);

    if (
      !WORKING_STATUSES.has(record.status) &&
      !LEAVE_STATUSES.has(record.status)
    ) {
      throw new Error(
        `Invalid attendance type on ${record.date}.`,
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

    const late = minutes(
      record.late,
      "Arrival late",
    );

    const leave = minutes(
      record.leaveDuration,
      "Personal leave",
    );

    const ot = minutes(record.ot, "OT");

    const double = minutes(
      record.double,
      "Double OT",
    );

    if (regular + ot + double > 1440) {
      throw new Error(
        `Worked time exceeds 24 hours on ${record.date}.`,
      );
    }

    arrivalLate += late;
    personalLeave += leave;

    if (record.status === "Holiday work") {
      if (regular !== 0 || ot !== 0) {
        throw new Error(
          `Edit and save Holiday work on ${record.date} to store its worked time as Double OT.`,
        );
      }

      holidayDays++;
      doubleMinutes += double;

      // Optional holiday work is paid as Double OT.
      // Its lateness does not reduce normal salary.
      continue;
    }

    attendedDays++;
    regularMinutes += regular;
    lateMinutes += late + leave;
    otMinutes += ot;
    doubleMinutes += double;
  }

  const leaveDays = paid + sick + noPay;
  const noPayMinutes = noPay * DAY_MINUTES;

  const lateDays = Math.floor(
    lateMinutes / DAY_MINUTES,
  );

  const extraLateMinutes =
    lateMinutes % DAY_MINUTES;

  const deductionDays = leaveDays + lateDays;

  /*
   * BASIC
   *
   * Monthly:
   * Monthly Basic minus explicit No-pay and late.
   * Paid/Sick leave does not reduce Basic.
   * Unrecorded Sundays/Poya are not treated as No-pay.
   *
   * Recorded:
   * Saved Regular minutes already exclude late and leave.
   * Do not deduct late again.
   * Saturday's saved Regular/OT split is preserved.
   */
  const basicBefore = monthlyMode
    ? monthlyBasic
    : regularMinutes * basicMinuteRate;

  const basicDeduction = monthlyMode
    ? Math.min(
        basicBefore,
        (noPayMinutes + lateMinutes) * basicMinuteRate,
      )
    : 0;

  const earnedBasic = Math.max(
    0,
    basicBefore - basicDeduction,
  );

  /*
   * TRAVEL
   *
   * 30,000 type:
   * Apply cumulative absence penalty instead of an
   * additional monthly per-day leave deduction.
   *
   * 45,000 type:
   * Apply ordinary per-day leave deductions.
   */
  const travelPenalties = [
    0,
    500,
    1500,
    3500,
    6000,
  ];

  const requestedTravelPenalty = is45000Type
    ? 0
    : travelPenalties[Math.min(deductionDays, 4)];

  const travel = calculateAllowance({
    monthlyAmount: monthlyTravel,
    monthlyMode,
    attendedDays,
    lateMinutes,
    leaveDays: is45000Type ? leaveDays : 0,
    penalty: requestedTravelPenalty,
  });

  /*
   * MEAL
   *
   * Monthly: subtract leave days and late minutes.
   * Recorded: start from attended days, subtract late only.
   */
  const meal = calculateAllowance({
    monthlyAmount: monthlyMeal,
    monthlyMode,
    attendedDays,
    lateMinutes,
    leaveDays,
  });

  /*
   * PRODUCTION BONUS
   *
   * Apply minute-level late deduction.
   * Other bonus reductions are entered manually.
   */
  const bonus = calculateAllowance({
    monthlyAmount: monthlyBonus,
    monthlyMode,
    attendedDays,
    lateMinutes,
  });

  if (manualBonusDeduction > round(bonus.after)) {
    throw new Error(
      `Production bonus deduction cannot exceed LKR ${round(bonus.after).toFixed(2)} after late deductions.`,
    );
  }

  const earnings = {
    basic: round(earnedBasic),

    // Excluded according to your earlier instruction.
    attendance: 0,

    travel: round(travel.after),
    meal: round(meal.after),

    bonus: round(
      Math.max(
        0,
        bonus.after - manualBonusDeduction,
      ),
    ),

    ot: round(
      otMinutes * otMinuteRate,
    ),

    double: round(
      doubleMinutes * doubleMinuteRate,
    ),
  };

  const gross = round(
    Object.values(earnings).reduce(
      (total, value) => total + value,
      0,
    ),
  );

  // Your worksheet method: EPF = 8% of Basic after deductions.
  const epfBase = earnings.basic;
  const epf = round(epfBase * EPF_RATE);

  const totalDeductions = round(
    epf + advance + other,
  );

  const payable = round(
    gross - totalDeductions,
  );

  if (payable < 0) {
    throw new Error(
      "Final deductions exceed the available salary.",
    );
  }

  return {
    period,
    calculationMode: mode,

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
      lateMinutes,
      extraLateMinutes,
      noPayMinutes,
      basicUnpaidMinutes: noPayMinutes + lateMinutes,
      otMinutes,
      doubleMinutes,
    },

    rates: {
      daily: basicDailyRate,
      hourly: basicHourlyRate,

      basicMinute: basicMinuteRate,
      otMinute: otMinuteRate,
      doubleMinute: doubleMinuteRate,

      ot: basicHourlyRate * 1.5,
      double: basicHourlyRate * 2,

      travelDaily: travel.dailyRate,
      mealDaily: meal.dailyRate,
      bonusDaily: bonus.dailyRate,

      travelMinute: travel.minuteRate,
      mealMinute: meal.minuteRate,
      bonusMinute: bonus.minuteRate,
    },

    deductions: {
      basic: round(basicDeduction),
      attendance: 0,

      meal: round(meal.standardDeduction),
      travel: round(travel.standardDeduction),
      travelPenalty: round(travel.penalty),

      bonus: round(
        bonus.standardDeduction + manualBonusDeduction,
      ),

      bonusLate: round(bonus.standardDeduction),
      bonusManual: round(manualBonusDeduction),

      epf,
      advance: round(advance),
      other: round(other),
    },

    earnedBeforeDeductions: {
      basic: round(basicBefore),
      travel: round(travel.before),
      meal: round(meal.before),
      bonus: round(bonus.before),
    },
  };
}