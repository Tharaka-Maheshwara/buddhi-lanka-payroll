const SHIFT_START = 8 * 60 + 30;
const WEEKDAY_END = 17 * 60 + 30;
const SATURDAY_REGULAR_END = 13 * 60 + 30;

// Saturday's break deduction applies only within 13:30–17:30.
const SATURDAY_OT_BREAK_MINUTES = 60;

// Used only in the arrival penalty after 09:15.
const MORNING_TEA_CREDIT = 15;

function toMinutes(value) {
  if (
    typeof value !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)
  ) {
    throw new Error("Enter valid 24-hour times.");
  }

  const [hours, minutes] = value.split(":").map(Number);

  return hours * 60 + minutes;
}

function overlap(start, end, rangeStart, rangeEnd) {
  return Math.max(
    0,
    Math.min(end, rangeEnd) - Math.max(start, rangeStart),
  );
}

function getSchedule(date) {
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    throw new Error("Select a valid attendance date.");
  }

  const [year, month, day] = date.split("-").map(Number);

  const parsed = new Date(0);
  parsed.setUTCFullYear(year, month - 1, day);
  parsed.setUTCHours(0, 0, 0, 0);

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error("Select a valid attendance date.");
  }

  const saturday = parsed.getUTCDay() === 6;

  return {
    saturday,
    start: SHIFT_START,
    regularEnd: saturday
      ? SATURDAY_REGULAR_END
      : WEEKDAY_END,

    // Weekdays already allow for the standard break hour.
    // Saturday's break is deducted from afternoon OT instead.
    regularMinutes: saturday ? 300 : 480,
  };
}

export function getPersonalLeaves(record) {
  if (Array.isArray(record.personalLeaves)) {
    return record.personalLeaves;
  }

  if (record.leaveOut || record.leaveIn) {
    return [
      {
        out: record.leaveOut || "",
        in: record.leaveIn || "",
      },
    ];
  }

  return [];
}

export function calculateArrivalLate(inTime) {
  const arrival = toMinutes(inTime);

  // Up to and including 08:35.
  if (arrival <= 8 * 60 + 35) return 0;

  // 08:36–08:45.
  if (arrival <= 8 * 60 + 45) return 15;

  // 08:46–09:00.
  if (arrival <= 9 * 60) return 30;

  // 09:01–09:15.
  if (arrival <= 9 * 60 + 15) return 60;

  // After 09:15: four hours minus the 15-minute tea credit.
  return 4 * 60 - MORNING_TEA_CREDIT;
}

function getClockDetails(record) {
  const {
    inTime,
    outTime,
    overnight = false,
    breakMinutes = 0,
  } = record;

  if (typeof overnight !== "boolean") {
    throw new Error("The overnight setting must be true or false.");
  }

  if (
    !Number.isInteger(breakMinutes) ||
    breakMinutes < 0 ||
    breakMinutes > 1440
  ) {
    throw new Error(
      "Additional breaks must be whole minutes between 0 and 1440.",
    );
  }

  const start = toMinutes(inTime);
  const end = toMinutes(outTime) + (overnight ? 1440 : 0);

  if (end <= start || end - start > 1440) {
    throw new Error(
      "Out time must be after In time. Check the saved overnight setting for historical entries.",
    );
  }

  const personalLeaves = getPersonalLeaves(record);

  if (personalLeaves.length > 20) {
    throw new Error(
      "A maximum of 20 personal leave periods is supported.",
    );
  }

  const intervals = personalLeaves.map((period, index) => {
    if (!period || !period.out || !period.in) {
      throw new Error(
        `Enter both Out and In times for personal leave ${index + 1}.`,
      );
    }

    let leaveStart = toMinutes(period.out);
    let leaveEnd = toMinutes(period.in);

    if (overnight) {
      if (leaveStart < start) leaveStart += 1440;
      if (leaveEnd < start) leaveEnd += 1440;
    }

    if (
      leaveEnd <= leaveStart ||
      leaveStart < start ||
      leaveEnd > end
    ) {
      throw new Error(
        `Personal leave ${index + 1} must fall within the shift, with In after Out.`,
      );
    }

    return {
      start: leaveStart,
      end: leaveEnd,
    };
  });

  intervals.sort((a, b) => a.start - b.start);

  let leave = 0;
  let previousEnd = start;

  for (const interval of intervals) {
    if (interval.start < previousEnd) {
      throw new Error(
        "Personal leave periods must not overlap.",
      );
    }

    leave += interval.end - interval.start;
    previousEnd = interval.end;
  }

  const worked = end - start - leave - breakMinutes;

  if (worked < 0) {
    throw new Error(
      "Personal leave and additional breaks exceed the shift.",
    );
  }

  return {
    start,
    end,
    intervals,
    leave,
    worked,
    breakMinutes,
  };
}

function workedWithin(details, rangeStart, rangeEnd) {
  const elapsed = overlap(
    details.start,
    details.end,
    rangeStart,
    rangeEnd,
  );

  const leave = details.intervals.reduce(
    (total, interval) =>
      total +
      overlap(
        interval.start,
        interval.end,
        rangeStart,
        rangeEnd,
      ),
    0,
  );

  return Math.max(0, elapsed - leave);
}

export function calculateClock(record) {
  const { leave, worked } = getClockDetails(record);

  // Raw clock duration, before schedule-based break deductions
  // and arrival penalties.
  return { leave, worked };
}

export function calculateAttendance(record) {
  const schedule = getSchedule(record.date);

  // Leave records do not require clock times.
  if (
    ["Paid leave", "Sick leave", "No pay"].includes(
      record.status,
    )
  ) {
    return {
      late: 0,
      leaveDuration: 0,
      regular: 0,
      ot: 0,
      double: 0,
    };
  }

  const details = getClockDetails(record);

  // The morning tea credit is already included in this value.
  const late = calculateArrivalLate(record.inTime);

  const regularLeave = details.intervals.reduce(
    (total, interval) =>
      total +
      overlap(
        interval.start,
        interval.end,
        schedule.start,
        schedule.regularEnd,
      ),
    0,
  );

  const earlyDeparture = Math.max(
    0,
    schedule.regularEnd -
      Math.max(schedule.start, details.end),
  );

  const hasRegularOverlap =
    overlap(
      details.start,
      details.end,
      schedule.start,
      schedule.regularEnd,
    ) > 0;

  const regular = hasRegularOverlap
    ? Math.max(
        0,
        schedule.regularMinutes -
          late -
          regularLeave -
          earlyDeparture -
          details.breakMinutes,
      )
    : 0;

  const morningOT = workedWithin(
    details,
    0,
    SHIFT_START,
  );

  const eveningOT = workedWithin(
    details,
    WEEKDAY_END,
    2880,
  );

  let saturdayAfternoonOT = 0;

  if (schedule.saturday) {
    const afternoonWorked = workedWithin(
      details,
      SATURDAY_REGULAR_END,
      WEEKDAY_END,
    );

    // The break hour is deducted exclusively from this window.
    // It never reduces morning OT, evening OT or Regular time.
    saturdayAfternoonOT = Math.max(
      0,
      afternoonWorked - SATURDAY_OT_BREAK_MINUTES,
    );
  }

  const ot =
    morningOT +
    saturdayAfternoonOT +
    eveningOT;

  if (record.status === "Holiday work") {
    return {
      late,
      leaveDuration: details.leave,
      regular: 0,
      ot: 0,
      double: regular + ot,
    };
  }

  return {
    late,
    leaveDuration: details.leave,
    regular,
    ot,
    double: 0,
  };
}

export function validateDurations(record) {
  for (const key of [
    "regular",
    "late",
    "unpaid",
    "ot",
    "double",
  ]) {
    if (
      !Number.isInteger(record[key]) ||
      record[key] < 0 ||
      record[key] > 1440
    ) {
      throw new Error(
        "Use whole minutes between 0 and 1440.",
      );
    }
  }

  if (
    record.leaveDuration !== undefined &&
    (
      !Number.isInteger(record.leaveDuration) ||
      record.leaveDuration < 0 ||
      record.leaveDuration > 1440
    )
  ) {
    throw new Error(
      "Personal leave must be whole minutes between 0 and 1440.",
    );
  }

  if (record.regular + record.ot + record.double > 1440) {
    throw new Error("Worked time exceeds 24 hours.");
  }
}