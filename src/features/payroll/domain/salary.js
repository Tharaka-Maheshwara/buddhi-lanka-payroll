const BASIC_DAYS = 25;
const ALLOWANCE_DAYS = 26;
const DAY_MINUTES = 480;
const EPF_RATE = 0.08;

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
    throw new Error(`${label} must be zero or greater.`);
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

export function calculateSalary(
  employee,
  records,
  adjustments = {},
) {
  const monthlyBasic = amount(
    employee.basic,
    "basic salary",
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

  const dailyBasicRate = monthlyBasic / BASIC_DAYS;
  const hourlyRate = dailyBasicRate / 8;
  const minuteRate = hourlyRate / 60;

  const otRate = hourlyRate * 1.5;
  const doubleRate = hourlyRate * 2;

  const dailyTravelRate = monthlyTravel / ALLOWANCE_DAYS;
  const dailyMealRate = monthlyMeal / ALLOWANCE_DAYS;
  const dailyBonusRate = monthlyBonus / ALLOWANCE_DAYS;

  let paid = 0;
  let sick = 0;
  let noPay = 0;
  let attendedDays = 0;
  let holidayDays = 0;

  let regularMinutes = 0;
  let paidLeaveMinutes = 0;

  let arrivalLate = 0;
  let personalLeave = 0;

  let otMinutes = 0;
  let doubleMinutes = 0;

  let allowanceLateMinutes = 0;

  const seenDates = new Set();

  for (const record of records) {
    if (
      typeof record.date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(record.date)
    ) {
      throw new Error("An attendance record has an invalid date.");
    }

    if (seenDates.has(record.date)) {
      throw new Error(
        `Duplicate attendance found for ${record.date}.`,
      );
    }

    seenDates.add(record.date);

    if (record.status === "Paid leave") {
      paid++;
      paidLeaveMinutes += DAY_MINUTES;
      continue;
    }

    if (record.status === "Sick leave") {
      sick++;
      paidLeaveMinutes += DAY_MINUTES;
      continue;
    }

    if (record.status === "No pay") {
      noPay++;
      continue;
    }

    if (
      !["Present", "Partial day", "Holiday work"].includes(
        record.status,
      )
    ) {
      throw new Error(
        `Invalid attendance type for ${record.date}.`,
      );
    }

    const regular = minutes(
      record.regular,
      "Regular worked time",
    );

    const ot = minutes(record.ot, "OT");
    const double = minutes(record.double, "Double OT");

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

    regularMinutes += regular;
    otMinutes += ot;
    doubleMinutes += double;

    if (record.status === "Holiday work") {
      holidayDays++;
    } else {
      // A regular working day earns daily allowances and bonus.
      attendedDays++;
      allowanceLateMinutes += late + leave;
    }
  }

  const lateMinutes = arrivalLate + personalLeave;
  const lateDays = Math.floor(lateMinutes / DAY_MINUTES);
  const extraLateMinutes = lateMinutes % DAY_MINUTES;

  const deductionDays = paid + sick + noPay + lateDays;

  // Basic is earned from actual regular minutes.
  // Paid/Sick leave receives an 8-hour basic credit per day.
  const basicPaidMinutes =
    regularMinutes + paidLeaveMinutes;

  const earnedBasic = round(
    basicPaidMinutes * minuteRate,
  );

  // Recorded regular minutes already reflect late/personal leave.
  // Do not deduct late time from Basic a second time.
  const basicDeduction = 0;

  const otPay = round(
    (otMinutes / 60) * otRate,
  );

  const doublePay = round(
    (doubleMinutes / 60) * doubleRate,
  );

  // Earn allowances only for recorded regular attendance days.
  // Paid/Sick/No-pay days do not receive these allowances.
  const travelBeforeDeductions = round(
    dailyTravelRate * attendedDays,
  );

  const mealBeforeDeductions = round(
    dailyMealRate * attendedDays,
  );

  // Separate one-decimal rounding follows the notebook method.
  const allowanceLateHours = Math.floor(
    allowanceLateMinutes / 60,
  );

  const allowanceLateRemainder =
    allowanceLateMinutes % 60;

  function lateAllowanceDeduction(monthlyAmount) {
    const daily = monthlyAmount / ALLOWANCE_DAYS;

    return round(
      round(
        (daily / 8) * allowanceLateHours,
        1,
      ) +
        round(
          (daily / DAY_MINUTES) * allowanceLateRemainder,
          1,
        ),
    );
  }

  const travelDeduction = lateAllowanceDeduction(
    monthlyTravel,
  );

  const mealDeduction = lateAllowanceDeduction(
    monthlyMeal,
  );

  const is45000Type =
    Number(employee.attendance || 0) > 0 ||
    monthlyBonus > 0 ||
    monthlyBasic === 45000;

  // Keep the previously confirmed 30k Travel penalty.
  // Do not apply an Attendance allowance or penalty in this mode.
  const travelPenalties = [
    0,
    500,
    1500,
    3500,
    6000,
  ];

  const travelPenalty = is45000Type
    ? 0
    : travelPenalties[Math.min(deductionDays, 4)];

  // Round after multiplying, so daily rounding does not accumulate.
  const earnedBonus = round(
    dailyBonusRate * attendedDays,
  );

  if (bonusDeduction > earnedBonus) {
    throw new Error(
      `Production bonus deduction cannot exceed the earned bonus of LKR ${earnedBonus.toFixed(2)}.`,
    );
  }

  const earnings = {
    basic: earnedBasic,

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
        mealBeforeDeductions - mealDeduction,
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

  // Follow the supplied worksheet's Basic-only EPF base.
  const epfBase = earnings.basic;
  const epf = round(epfBase * EPF_RATE);

  const totalDeductions = round(
    epf + advance + otherDeduction,
  );

  const payable = round(
    gross - totalDeductions,
  );

  if (payable < 0) {
    throw new Error(
      "EPF, advance and other deductions exceed the earned salary.",
    );
  }

  return {
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
      paidLeaveMinutes,
      basicPaidMinutes,
      arrivalLate,
      personalLeave,
      lateMinutes,
      extraLateMinutes,
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
      basic: earnedBasic,
      travel: travelBeforeDeductions,
      meal: mealBeforeDeductions,
      bonus: earnedBonus,
    },
  };
}