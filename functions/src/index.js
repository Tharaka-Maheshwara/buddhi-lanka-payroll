import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { calculateDraft, defaultRules } from "./calculate.js";

initializeApp();

export const calculatePayrollDraft = onCall(
  {
    region: "asia-south1",
    maxInstances: 3,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in first.");
    }

    const db = getFirestore();

    // Authorize the single account configured in Firestore.
    const accessSnapshot = await db.doc("access/admin").get();
    const access = accessSnapshot.data();

    if (
      !accessSnapshot.exists ||
      access.enabled !== true ||
      access.uid !== request.auth.uid
    ) {
      throw new HttpsError(
        "permission-denied",
        "Only the company-approved account can access payroll.",
      );
    }

    const period = request.data?.period;

    if (
      typeof period !== "string" ||
      !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Use YYYY-MM for the payroll period.",
      );
    }

    const [employeeSnapshot, attendanceSnapshot, settingsSnapshot] =
      await Promise.all([
        db.collection("employees").get(),
        db
          .collection("attendance")
          .where("date", ">=", `${period}-01`)
          .where("date", "<=", `${period}-31`)
          .get(),
        db.doc("settings/payroll").get(),
      ]);

    if (employeeSnapshot.size > 200) {
      throw new HttpsError(
        "resource-exhausted",
        "This starter supports up to 200 employees per draft.",
      );
    }

    const rules = settingsSnapshot.exists
      ? settingsSnapshot.data()
      : defaultRules;

    const attendance = attendanceSnapshot.docs.map((document) =>
      document.data(),
    );

    try {
      const rows = employeeSnapshot.docs.map((document) => {
        const employee = document.data();

        const employeeAttendance = attendance.filter(
          (record) => record.employee === document.id,
        );

        return {
          employeeId: document.id,
          name: employee.name,
          ...calculateDraft(employee, employeeAttendance, rules),
        };
      });

      const batch = db.batch();

      for (const row of rows) {
        const draftReference = db.doc(
          `drafts/${period}_${row.employeeId}`,
        );

        batch.set(draftReference, {
          ...row,
          period,
          status: "draft",
          rules: {
            days: rules.days,
            hours: rules.hours,
            ot: rules.ot,
            double: rules.double,
          },
          calculatedAt: FieldValue.serverTimestamp(),
          calculatedBy: request.auth.uid,
        });
      }

      if (rows.length > 0) {
        await batch.commit();
      }

      return {
        period,
        employees: rows.length,
        status: "draft",
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "failed-precondition",
        "Review payroll input data and settings.",
      );
    }
  },
);