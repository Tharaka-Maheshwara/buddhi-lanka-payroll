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

function validateResult(result) {
  const values = [
    result?.gross,
    result?.payable,
    result?.totalDeductions,
    result?.epf?.base,
    result?.epf?.amount,
    result?.deductions?.epf,
    result?.deductions?.advance,
    result?.deductions?.other,
  ];

  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error(
      "Update domain/salary.js with the EPF-enabled calculation before downloading.",
    );
  }

  const expectedEPF = Math.round(
    (result.epf.base * 0.08 + Number.EPSILON) * 100,
  ) / 100;

  const expectedDeductions =
    result.deductions.epf +
    result.deductions.advance +
    result.deductions.other;

  if (
    Math.abs(expectedEPF - result.deductions.epf) > 0.011 ||
    Math.abs(result.epf.amount - result.deductions.epf) > 0.011 ||
    Math.abs(expectedDeductions - result.totalDeductions) > 0.011 ||
    Math.abs(
      result.gross - result.totalDeductions - result.payable,
    ) > 0.011
  ) {
    throw new Error(
      "Salary totals do not match the EPF calculation. Review the salary calculation.",
    );
  }
}

async function createPaysheet(employee, period, result) {
  validateResult(result);

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
  const bottomLimit = height - 22;
  const green = [20, 70, 57];

  let y = 18;

  pdf.setProperties({
    title: `Paysheet - ${employee.name} - ${period}`,
    subject: "Salary calculation including employee EPF",
    author: "Buddhi Lanka Engineers",
  });

  const logo = await loadLogo();
  let hasLogo = false;

  if (logo) {
    try {
      const image = pdf.getImageProperties(logo);
      const scale = Math.min(
        25 / image.width,
        19 / image.height,
      );

      pdf.addImage(
        logo,
        image.fileType,
        margin,
        13,
        image.width * scale,
        image.height * scale,
      );

      hasLogo = true;
    } catch {
      // Continue without a logo if the image cannot be read.
    }
  }

  const headingX = hasLogo ? margin + 30 : margin;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.setTextColor(...green);
  pdf.text("BUDDHI LANKA ENGINEERS", headingX, y);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(90);
  pdf.text("EMPLOYEE PAY SHEET", headingX, y + 7);

  y = 39;

  pdf.setDrawColor(210);
  pdf.line(margin, y, right, y);

  y += 8;

  function ensureSpace(required) {
    if (y + required <= bottomLimit) return;

    pdf.addPage();
    y = 20;
  }

  function section(title) {
    // Keep the heading together with at least the first row.
    ensureSpace(25);

    pdf.setFillColor(...green);
    pdf.rect(margin, y, contentWidth, 8, "F");

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(255);
    pdf.text(title, margin + 3, y + 5.5);

    y += 14;
  }

  function row(label, value, options = {}) {
    const {
      bold = false,
      deduction = false,
    } = options;

    pdf.setFont("helvetica", bold ? "bold" : "normal");
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
      Math.max(labelLines.length, valueLines.length) * 4.5 + 2,
    );

    ensureSpace(rowHeight);

    pdf.setTextColor(35);
    pdf.text(labelLines, margin + 2, y);

    if (deduction) {
      pdf.setTextColor(170, 35, 35);
    }

    pdf.text(valueLines, right - 2, y, {
      align: "right",
    });

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

  y += 3;

  section("ATTENDANCE SUMMARY");

  row("Arrival late", duration(result.time.arrivalLate));
  row("Personal leave", duration(result.time.personalLeave));
  row("Approved total late", duration(result.time.lateMinutes));

  row("Paid leave", `${result.counts.paid} days`);
  row("Sick leave", `${result.counts.sick} days`);
  row("No-pay leave", `${result.counts.noPay} days`);

  row(
    "Late converted to days",
    `${result.counts.lateDays} days`,
  );

  row(
    "Remaining late time",
    duration(result.time.extraLateMinutes),
  );

  row("Normal OT", duration(result.time.otMinutes));
  row("Double OT", duration(result.time.doubleMinutes));

  y += 3;

  section("EARNINGS ADJUSTMENTS");

  const earningsDeductions = [
    ["Basic deduction", result.deductions.basic],
    ["Attendance penalty", result.deductions.attendance],
    ["Meal deduction", result.deductions.meal],
    ["Travel standard deduction", result.deductions.travel],
    ["Travel penalty", result.deductions.travelPenalty],
    ["Production bonus deduction", result.deductions.bonus],
  ];

  for (const [label, value] of earningsDeductions) {
    row(label, currency(value));
  }

  y += 3;

  section("SALARY SUMMARY");

  const earnings = [
    ["Basic after deductions", result.earnings.basic],
    ["Attendance allowance", result.earnings.attendance],
    ["Meal allowance", result.earnings.meal],
    ["Travelling allowance", result.earnings.travel],
    ["Production bonus", result.earnings.bonus],
    ["Normal OT payment", result.earnings.ot],
    ["Double OT payment", result.earnings.double],
  ];

  for (const [label, value] of earnings) {
    row(label, currency(value));
  }

  row("Gross salary", currency(result.gross), {
    bold: true,
  });

  y += 3;

  // Keep the final deductions and payable section together.
  ensureSpace(95);

  section("EPF AND FINAL DEDUCTIONS");

  row(
    "EPF base: basic after deductions",
    currency(result.epf.base),
  );

  row(
    "Employee EPF (8%)",
    `- ${currency(result.deductions.epf)}`,
    { deduction: true },
  );

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

  ensureSpace(38);

  y += 3;

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

  pdf.text("NET PAYABLE", margin + 4, y + 8);

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
    /[^a-zA-Z0-9_-]/g,
    "_",
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
    if (!result || !employee || busy) return;

    setBusy(true);
    setError("");

    try {
      await createPaysheet(employee, period, result);
    } catch (error) {
      console.error("Paysheet download failed:", error);

      setError(
        error.message ||
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
        disabled={busy || !result || !employee}
        onClick={download}
      >
        {busy ? "Creating PDF…" : "Download paysheet"}
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