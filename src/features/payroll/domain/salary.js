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

  // Keep full precision until final monetary amounts.
  const basicDailyRate = monthlyBasic / BASIC_DAYS;
  const basicHourlyRate = basicDailyRate / 8;
  const basicMinuteRate = basicHourlyRate / 60;

  const otMinuteRate = basicMinuteRate * 1.5;
  const doubleMinuteRate = basicMinuteRate * 2;

  const attendanceDailyRate =
    monthlyAttendance / ALLOWANCE_DAYS;

  const attendanceMinuteRate =
    attendanceDailyRate / DAY_MINUTES;

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

  // Existing type identification remains unchanged.
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

      continue;
    }

    attendedDays++;
    regularMinutes += regular;
    lateMinutes += late + leave;
    otMinutes += ot;
    doubleMinutes += double;

    // Saturday: 5 Regular hours earn one full Basic day.
    const scheduledRegularMinutes =
      isSaturday(record.date) ? 300 : 480;

    // Arrival late and Personal leave are already accounted for.
    const expectedAfterLate = Math.max(
      0,
      scheduledRegularMinutes - late - leave,
    );

    // Additional missing Regular time, such as early departure.
    otherMissingRegularMinutes += Math.max(
      0,
      expectedAfterLate - regular,
    );
  }

  const leaveDays = paid + sick + noPay;
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

  // Basic calculation remains unchanged.
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
   * ATTENDANCE ALLOWANCE
   *
   * Includes:
   * - Arrival late
   * - Personal leave
   * - Additional missing Regular time / early departure
   *
   * The same minute is not deducted twice.
   */
  const attendanceDeductibleMinutes =
    lateMinutes + otherMissingRegularMinutes;

  const attendancePenalties = [
    0,
    2000,
    6000,
    12000,
    20000,
  ];

  const attendanceBefore = is45000Type
    ? attendanceDailyRate * allowanceBaseDays
    : 0;

  const attendanceLateRequested = is45000Type
    ? attendanceMinuteRate * attendanceDeductibleMinutes
    : 0;

  const attendancePenaltyRequested = is45000Type
    ? attendancePenalties[Math.min(deductionDays, 4)]
    : 0;

  const attendanceComponent = calculateComponent(
    attendanceBefore,
    attendanceLateRequested,
    attendancePenaltyRequested,
  );

  // Travel calculation remains unchanged.
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

  // Meal calculation remains unchanged.
  const mealBefore =
    mealDailyRate * allowanceBaseDays;

  const meal = calculateComponent(
    mealBefore,
    mealDailyRate * leaveDays +
      lateMinutes * mealMinuteRate,
  );

  // Production bonus calculation remains unchanged.
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

    attendance: round(attendanceComponent.after),

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

  // EPF calculation remains unchanged.
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
      attendanceDeductibleMinutes,
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

      attendanceDaily: attendanceDailyRate,
      attendanceMinute: attendanceMinuteRate,

      travelDaily: travelDailyRate,
      mealDaily: mealDailyRate,
      bonusDaily: bonusDailyRate,

      travelMinute: travelMinuteRate,
      mealMinute: mealMinuteRate,
      bonusMinute: bonusMinuteRate,
    },

    deductions: {
      basic: round(basic.standardDeduction),

      attendance: round(
        attendanceComponent.standardDeduction +
          attendanceComponent.penalty,
      ),

      attendanceLate: round(
        attendanceComponent.standardDeduction,
      ),

      attendancePenalty: round(
        attendanceComponent.penalty,
      ),

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
      attendance: round(attendanceComponent.before),
      travel: round(travel.before),
      meal: round(meal.before),
      bonus: round(bonus.before),
    },
  };
}