const SHIFT_START = 8 * 60 + 30;
const SHIFT_END = 17 * 60 + 30;
const LUNCH_MINUTES = 60;

const REGULAR_DAY_MINUTES =
  SHIFT_END - SHIFT_START - LUNCH_MINUTES;

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

  if (arrival < 8 * 60 + 35) return 0;
  if (arrival < 8 * 60 + 45) return 15;
  if (arrival < 9 * 60) return 30;
  if (arrival <= 9 * 60 + 15) return 60;

  return 240;
}

function getClockDetails(record) {
  const {
    inTime,
    outTime,
    overnight = false,
    breakMinutes = 0,
  } = record;

  if (
    !Number.isInteger(breakMinutes) ||
    breakMinutes < 0 ||
    breakMinutes > 1440
  ) {
    throw new Error(
      "Breaks must be whole minutes between 0 and 1440.",
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

  intervals.sort(
    (first, second) => first.start - second.start,
  );

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
      "Personal leave and breaks exceed the shift.",
    );
  }

  return {
    start,
    end,
    intervals,
    leave,
    worked,
  };
}

export function calculateClock(record) {
  const { leave, worked } = getClockDetails(record);

  return { leave, worked };
}

export function calculateAttendance(record) {
  const details = getClockDetails(record);
  const late = calculateArrivalLate(record.inTime);

  const morningOT = overlap(
    details.start,
    details.end,
    0,
    SHIFT_START,
  );

  const eveningOT = overlap(
    details.start,
    details.end,
    SHIFT_END,
    2880,
  );

  let regularLeave = 0;
  let overtimeLeave = 0;

  for (const interval of details.intervals) {
    regularLeave += overlap(
      interval.start,
      interval.end,
      SHIFT_START,
      SHIFT_END,
    );

    overtimeLeave +=
      overlap(
        interval.start,
        interval.end,
        0,
        SHIFT_START,
      ) +
      overlap(
        interval.start,
        interval.end,
        SHIFT_END,
        2880,
      );
  }

  const earlyDeparture = Math.max(
    0,
    SHIFT_END - Math.max(SHIFT_START, details.end),
  );

  const hasRegularOverlap =
    overlap(
      details.start,
      details.end,
      SHIFT_START,
      SHIFT_END,
    ) > 0;

  let regular = 0;

  if (hasRegularOverlap) {
    regular = Math.max(
      0,
      REGULAR_DAY_MINUTES -
        late -
        regularLeave -
        earlyDeparture -
        (record.breakMinutes || 0),
    );
  }

  const ot = Math.max(
    0,
    morningOT + eveningOT - overtimeLeave,
  );

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
  const keys = [
    "regular",
    "late",
    "unpaid",
    "ot",
    "double",
  ];

  for (const key of keys) {
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
    record.regular + record.ot + record.double > 1440
  ) {
    throw new Error("Worked time exceeds 24 hours.");
  }
}