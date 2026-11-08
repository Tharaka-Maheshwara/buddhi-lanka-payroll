import {
  createContext,
  useContext,
  useState,
} from "react";

const PeriodContext = createContext(null);

const STORAGE_KEY = "buddhi-payroll:selected-period";

function isValidPeriod(value) {
  return (
    typeof value === "string" &&
    /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value)
  );
}

function getCurrentPeriod() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find(
    (part) => part.type === "year",
  ).value;

  const month = parts.find(
    (part) => part.type === "month",
  ).value;

  return `${year}-${month}`;
}

function getInitialPeriod() {
  try {
    const savedPeriod = window.localStorage.getItem(
      STORAGE_KEY,
    );

    if (isValidPeriod(savedPeriod)) {
      return savedPeriod;
    }
  } catch {
    // Use the current month if browser storage is unavailable.
  }

  return getCurrentPeriod();
}

export function PeriodProvider({ children }) {
  const [period, updatePeriod] = useState(getInitialPeriod);

  function setPeriod(value) {
    if (!isValidPeriod(value)) return;

    updatePeriod(value);

    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        value,
      );
    } catch {
      // Month selection still works without persistent storage.
    }
  }

  return (
    <PeriodContext.Provider
      value={{
        period,
        setPeriod,
      }}
    >
      {children}
    </PeriodContext.Provider>
  );
}

export function usePeriod() {
  const context = useContext(PeriodContext);

  if (!context) {
    throw new Error(
      "usePeriod must be used inside PeriodProvider.",
    );
  }

  return context;
}