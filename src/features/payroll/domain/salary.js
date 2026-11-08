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

function isSaturday(value) {
  return new Date(`${value}T00:00:00Z`).getUTCDay() === 6;
}

function calculateComponent(
  before,
  requestedStandardDeduction,
  requestedPenalty = 0,
) {
  const standardDeduction = Math.min(
    before,
    requestedStandardDeduction,
  );

  const remaining = Math.max(
    0,
    before - standardDeduction,
  );

  const penalty = Math.min(
    remaining,
    requestedPenalty,
  );

  return {
    before,
    standardDeduction,
    penalty,
    after: Math.max(0, remaining - penalty),
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

  // Do not round rates during calculation.
  const basicDailyRate = monthlyBasic / BASIC_DAYS;
  const basicHourlyRate = basicDailyRate / 8;
  const basicMinuteRate = basicHourlyRate / 60;

  const otMinuteRate = basicMinuteRate * 1.5;
  const doubleMinuteRate = basicMinuteRate * 2;

  const travelDailyRate =
    monthlyTravel / ALLOWANCE_DAYS;

  const mealDailyRate =
    monthlyMeal / ALLOWANCE_DAYS;

  const bonusDailyRate =
    monthlyBonus / ALLOWANCE_DAYS;

  const travelMinuteRate =
    travelDailyRate / DAY_MINUTES;

  const mealMinuteRate =
    mealDailyRate / DAY_MINUTES;

  const bonusMinuteRate =
    bonusDailyRate / DAY_MINUTES;

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

  // Unworked scheduled time beyond the saved late/leave
  // deductions, for example an early departure.
  let otherMissingRegularMinutes = 0;

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
          `Edit and save Holiday work on ${record.date} to store worked time as Double OT.`,
        );
      }

      holidayDays++;
      doubleMinutes += double;

      // Optional holiday work does not create a normal
      // salary absence or lateness penalty.
      continue;
    }

    attendedDays++;
    regularMinutes += regular;
    lateMinutes += late + leave;
    otMinutes += ot;
    doubleMinutes += double;

    /*
     * Saturday has only 300 scheduled Regular minutes,
     * but completing them earns one full Basic day.
     */
    const scheduledRegularMinutes =
      isSaturday(record.date) ? 300 : 480;

    const expectedAfterLate = Math.max(
      0,
      scheduledRegularMinutes - late - leave,
    );

    otherMissingRegularMinutes += Math.max(
      0,
      expectedAfterLate - regular,
    );
  }

  const leaveDays = paid + sick + noPay;

  /*
   * Every explicitly recorded normal day advances
   * the calculation. Missing dates do not become No-pay.
   *
   * Cap Basic at its monthly 25-day basis and allowances
   * at their monthly 26-day basis.
   */
  const coveredDays = attendedDays + leaveDays;

  const basicBaseDays = Math.min(
    BASIC_DAYS,
    coveredDays,
  );

  const allowanceBaseDays = Math.min(
    ALLOWANCE_DAYS,
    coveredDays,
  );

  const basicBefore =
    basicDailyRate * basicBaseDays;

  const noPayMinutes = noPay * DAY_MINUTES;

  /*
   * Start from credited Basic days, including Saturday.
   * Deduct late once, then any additional missing
   * scheduled Regular time.
   *
   * Paid/Sick leave retains Basic.
   */
  const basicUnpaidMinutes =
    noPayMinutes +
    lateMinutes +
    otherMissingRegularMinutes;

  const basic = calculateComponent(
    basicBefore,
    basicUnpaidMinutes * basicMinuteRate,
  );

  const lateDays = Math.floor(
    lateMinutes / DAY_MINUTES,
  );

  const extraLateMinutes =
    lateMinutes % DAY_MINUTES;

  const deductionDays =
    leaveDays + lateDays;

  /*
   * 30,000 type Travel:
   * cumulative absence penalty replaces the ordinary
   * per-day leave deduction, following your example.
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

  const travelBefore =
    travelDailyRate * allowanceBaseDays;

  const travelLeaveDeduction = is45000Type
    ? travelDailyRate * leaveDays
    : 0;

  const travel = calculateComponent(
    travelBefore,
    travelLeaveDeduction +
      lateMinutes * travelMinuteRate,
    requestedTravelPenalty,
  );

  const mealBefore =
    mealDailyRate * allowanceBaseDays;

  const meal = calculateComponent(
    mealBefore,
    mealDailyRate * leaveDays +
      lateMinutes * mealMinuteRate,
  );

  /*
   * Bonus accrues from covered days.
   * Apply automatic late deduction and additional
   * manually entered bonus deduction.
   */
  const bonusBefore =
    bonusDailyRate * allowanceBaseDays;

  const bonus = calculateComponent(
    bonusBefore,
    lateMinutes * bonusMinuteRate,
  );

  if (manualBonusDeduction > round(bonus.after)) {
    throw new Error(
      `Production bonus deduction cannot exceed LKR ${round(bonus.after).toFixed(2)} after late deductions.`,
    );
  }

  const earnings = {
    basic: round(basic.after),

    // Remains excluded according to your instruction.
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

  // Your selected worksheet method.
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
    calculationMode: "attendance-based",

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
      coveredDays,
      basicBaseDays,
      allowanceBaseDays,
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
      otherMissingRegularMinutes,
      basicUnpaidMinutes,
      otMinutes,
      doubleMinutes,
    },

    rates: {
      daily: basicDailyRate,
      hourly: basicHourlyRate,
      basicMinute: basicMinuteRate,

      ot: basicHourlyRate * 1.5,
      double: basicHourlyRate * 2,

      otMinute: otMinuteRate,
      doubleMinute: doubleMinuteRate,

      travelDaily: travelDailyRate,
      mealDaily: mealDailyRate,
      bonusDaily: bonusDailyRate,

      travelMinute: travelMinuteRate,
      mealMinute: mealMinuteRate,
      bonusMinute: bonusMinuteRate,
    },

    deductions: {
      basic: round(basic.standardDeduction),
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
      basic: round(basic.before),
      travel: round(travel.before),
      meal: round(meal.before),
      bonus: round(bonus.before),
    },
  };
}