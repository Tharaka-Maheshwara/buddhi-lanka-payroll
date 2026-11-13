import { useState } from "react";
import { jsPDF } from "jspdf";

import { Button } from "../../shared/ui";
import { duration } from "../../shared/utils/format";

function currency(value) {
  return `LKR ${Number(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

async function loadLogo() {
  try {
    const response = await fetch("/company-logo.png");

    if (!response.ok) return null;

    const blob = await response.blob();

    if (!blob.type.startsWith("image/")) return null;

    return await new Promise((resolve) => {
      const reader = new FileReader();

      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve(null);

      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function validateResult(employee, period, result) {
  if (!employee?.name || !result) {
    throw new Error(
      "Select an employee and calculate salary first.",
    );
  }

  if (result.period !== period) {
    throw new Error(
      "The calculation belongs to another pay period. Calculate again.",
    );
  }

  if (
    typeof result.epf?.enabled !== "boolean" ||
    result.epf.enabled !== (employee.epfEnabled === true)
  ) {
    throw new Error(
      "The employee EPF setting has changed. Calculate salary again.",
    );
  }

  if (!result.earnings || !result.deductions) {
    throw new Error(
      "Salary details are missing. Calculate salary again.",
    );
  }

  const earningKeys = [
    "basic",
    "attendance",
    "travel",
    "meal",
    "bonus",
    "ot",
    "double",
  ];

  const values = [
    ...earningKeys.map((key) => result.earnings[key]),
    result.gross,
    result.payable,
    result.totalDeductions,
    result.epf.base,
    result.epf.amount,
    result.deductions.epf,
    result.deductions.advance,
    result.deductions.other,
  ];

  if (
    values.some(
      (value) =>
        !Number.isFinite(value) || value < 0,
    )
  ) {
    throw new Error(
      "Invalid salary amounts. Calculate salary again.",
    );
  }

  const expectedGross = earningKeys.reduce(
    (total, key) => total + result.earnings[key],
    0,
  );

  const expectedEPF = result.epf.enabled
    ? Math.round(
        (result.epf.base * 0.08 + Number.EPSILON) * 100,
      ) / 100
    : 0;

  const expectedDeductions =
    result.deductions.epf +
    result.deductions.advance +
    result.deductions.other;

  if (
    Math.abs(expectedGross - result.gross) > 0.011 ||
    Math.abs(result.epf.base - result.earnings.basic) > 0.011 ||
    Math.abs(expectedEPF - result.deductions.epf) > 0.011 ||
    Math.abs(result.epf.amount - result.deductions.epf) > 0.011 ||
    Math.abs(expectedDeductions - result.totalDeductions) > 0.011 ||
    Math.abs(
      result.gross -
        result.totalDeductions -
        result.payable,
    ) > 0.011
  ) {
    throw new Error(
      "Salary totals do not match. Calculate salary again.",
    );
  }
}

async function createPaysheet(employee, period, result) {
  validateResult(employee, period, result);

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();

  const margin = 16;
  const right = width - margin;
  const contentWidth = width - margin * 2;
  const bottom = height - 22;
  const green = [20, 70, 57];

  let y = 18;

  pdf.setProperties({
    title: `Paysheet - ${employee.name} - ${period}`,
    subject: "Employee salary calculation",
    author: "Buddhi Lanka Engineers",
  });

  const logo = await loadLogo();
  let hasLogo = false;

  if (logo) {
    try {
      const properties = pdf.getImageProperties(logo);

      const scale = Math.min(
        25 / properties.width,
        19 / properties.height,
      );

      pdf.addImage(
        logo,
        properties.fileType,
        margin,
        13,
        properties.width * scale,
        properties.height * scale,
      );

      hasLogo = true;
    } catch {
      // Continue without the logo.
    }
  }

  const headingX = hasLogo ? margin + 30 : margin;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.setTextColor(...green);

  pdf.text(
    "BUDDHI LANKA ENGINEERS",
    headingX,
    y,
  );

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(90);

  pdf.text(
    "EMPLOYEE PAY SHEET",
    headingX,
    y + 7,
  );

  y = 39;

  pdf.setDrawColor(210);
  pdf.line(margin, y, right, y);

  y += 8;

  function ensureSpace(required) {
    if (y + required <= bottom) return;

    pdf.addPage();
    y = 22;
  }

  function section(title) {
    ensureSpace(25);

    pdf.setFillColor(...green);
    pdf.rect(margin, y, contentWidth, 8, "F");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(255);

    pdf.text(
      title,
      margin + 3,
      y + 5.5,
    );

    y += 15;
  }

  function row(
    label,
    value,
    { bold = false, deduction = false } = {},
  ) {
    pdf.setFont(
      "helvetica",
      bold ? "bold" : "normal",
    );

    pdf.setFontSize(9);

    const labelLines = pdf.splitTextToSize(
      String(label),
      contentWidth - 65,
    );

    const valueLines = pdf.splitTextToSize(
      String(value),
      60,
    );

    const rowHeight = Math.max(
      7,
      Math.max(
        labelLines.length,
        valueLines.length,
      ) * 4.5 + 2,
    );

    ensureSpace(rowHeight);

    pdf.setTextColor(35);

    pdf.text(
      labelLines,
      margin + 2,
      y,
    );

    if (deduction) {
      pdf.setTextColor(155, 35, 35);
    }

    pdf.text(
      valueLines,
      right - 2,
      y,
      { align: "right" },
    );

    pdf.setDrawColor(235);

    pdf.line(
      margin,
      y + rowHeight - 3,
      right,
      y + rowHeight - 3,
    );

    y += rowHeight;
  }

  row("Employee name", employee.name);
  row("Role", employee.role || "-");
  row("Pay period", period);

  row(
    "Employee EPF",
    result.epf.enabled
      ? "8% deduction enabled"
      : "Not selected - no deduction",
  );

  y += 3;

  section("ATTENDANCE SUMMARY");

  row(
    "Recorded dates",
    `${result.counts.recordedDays} days`,
  );

  row(
    "Worked days",
    `${result.counts.attendedDays} days`,
  );

  row(
    "Holiday work",
    `${result.counts.holidayDays} days`,
  );

  row(
    "Regular worked time",
    duration(result.time.regularMinutes),
  );

  row(
    "Arrival late",
    duration(result.time.arrivalLate),
  );

  row(
    "Personal leave",
    duration(result.time.personalLeave),
  );

  row(
    "Arrival late + personal leave",
    duration(result.time.lateMinutes),
  );

  row(
    "Other missing regular time",
    duration(result.time.otherMissingRegularMinutes),
  );

  row(
    "Attendance allowance deduction time",
    duration(result.time.attendanceDeductibleMinutes),
  );

  row(
    "Paid leave",
    `${result.counts.paid} days`,
  );

  row(
    "Sick leave",
    `${result.counts.sick} days`,
  );

  row(
    "No-pay leave",
    `${result.counts.noPay} days`,
  );

  row(
    "Normal OT",
    duration(result.time.otMinutes),
  );

  row(
    "Double OT",
    duration(result.time.doubleMinutes),
  );

  y += 3;

  section("EARNINGS ADJUSTMENTS");

  const adjustments = [
    [
      "Basic deduction",
      result.deductions.basic,
    ],
    [
      "Attendance allowance time deduction",
      result.deductions.attendanceLate,
    ],
    [
      "Attendance allowance absence penalty",
      result.deductions.attendancePenalty,
    ],
    [
      "Meal deduction",
      result.deductions.meal,
    ],
    [
      "Travel standard deduction",
      result.deductions.travel,
    ],
    [
      "Travel penalty",
      result.deductions.travelPenalty,
    ],
    [
      "Production bonus late deduction",
      result.deductions.bonusLate,
    ],
    [
      "Manual production bonus deduction",
      result.deductions.bonusManual,
    ],
  ];

  for (const [label, value] of adjustments) {
    row(label, currency(value));
  }

  y += 3;

  section("SALARY SUMMARY");

  const earnings = [
    [
      "Basic after deductions",
      result.earnings.basic,
    ],
    [
      "Attendance allowance",
      result.earnings.attendance,
    ],
    [
      "Meal allowance",
      result.earnings.meal,
    ],
    [
      "Travelling allowance",
      result.earnings.travel,
    ],
    [
      "Production bonus",
      result.earnings.bonus,
    ],
    [
      "Normal OT payment",
      result.earnings.ot,
    ],
    [
      "Double OT payment",
      result.earnings.double,
    ],
  ];

  for (const [label, value] of earnings) {
    row(label, currency(value));
  }

  row(
    "Gross salary",
    currency(result.gross),
    { bold: true },
  );

  y += 3;

  // Keep the final deduction and net-pay area together.
  ensureSpace(result.epf.enabled ? 100 : 92);

  section("FINAL DEDUCTIONS");

  if (result.epf.enabled) {
    row(
      "EPF base: basic after deductions",
      currency(result.epf.base),
    );

    row(
      "Employee EPF (8%)",
      `- ${currency(result.deductions.epf)}`,
      { deduction: true },
    );
  } else {
    row(
      "Employee EPF",
      "Not selected - no deduction",
    );
  }

  row(
    "Advance",
    `- ${currency(result.deductions.advance)}`,
    { deduction: true },
  );

  row(
    "Other deductions",
    `- ${currency(result.deductions.other)}`,
    { deduction: true },
  );

  row(
    "Total deductions from gross",
    `- ${currency(result.totalDeductions)}`,
    {
      bold: true,
      deduction: true,
    },
  );

  ensureSpace(45);

  y += 4;

  pdf.setFillColor(...green);

  pdf.roundedRect(
    margin,
    y,
    contentWidth,
    12,
    2,
    2,
    "F",
  );

  pdf.setTextColor(255);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);

  pdf.text(
    "NET PAYABLE",
    margin + 4,
    y + 8,
  );

  pdf.text(
    currency(result.payable),
    right - 4,
    y + 8,
    { align: "right" },
  );

  y += 29;

  pdf.setTextColor(80);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);

  pdf.text(
    "Prepared by: __________________",
    margin,
    y,
  );

  pdf.text(
    "Received by: __________________",
    right,
    y,
    { align: "right" },
  );

  const pageCount = pdf.getNumberOfPages();

  for (let page = 1; page <= pageCount; page++) {
    pdf.setPage(page);

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(120);

    pdf.text(
      "Generated from the current salary calculation.",
      margin,
      height - 10,
    );

    pdf.text(
      `${page} / ${pageCount}`,
      right,
      height - 10,
      { align: "right" },
    );
  }

  const safeName =
    String(employee.name)
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .slice(0, 70) || "Employee";

  const safePeriod = String(period).replace(
    /[^0-9-]/g,
    "",
  );

  await pdf.save(
    `Paysheet_${safeName}_${safePeriod}.pdf`,
    { returnPromise: true },
  );
}

export function DownloadPaysheet({
  employee,
  period,
  result,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    if (
      !employee ||
      !result ||
      busy
    ) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      await createPaysheet(
        employee,
        period,
        result,
      );
    } catch (failure) {
      console.error(
        "Paysheet download failed:",
        failure,
      );

      setError(
        failure.message ||
          "Unable to download the paysheet. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-5">
      <Button
        type="button"
        disabled={
          busy ||
          !employee ||
          !result
        }
        onClick={download}
      >
        {busy
          ? "Creating PDF…"
          : "Download paysheet"}
      </Button>

      {error && (
        <p
          role="alert"
          className="mt-2 text-sm text-red-700"
        >
          {error}
        </p>
      )}
    </div>
  );
}