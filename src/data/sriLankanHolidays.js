const holidaysByYear = {
  2026: [
    ["2026-01-03", "Duruthu Full Moon Poya Day"],
    ["2026-01-15", "Tamil Thai Pongal Day"],
    ["2026-02-01", "Navam Full Moon Poya Day"],
    ["2026-02-04", "National Day"],
    ["2026-02-15", "Mahasivarathri Day"],
    ["2026-03-02", "Madin Full Moon Poya Day"],
    ["2026-03-18", "Public Holiday"],
    ["2026-03-21", "Id-Ul-Fitr"],
    ["2026-03-25", "Public Holiday"],
    ["2026-04-01", "Bak Full Moon Poya Day"],
    ["2026-04-03", "Good Friday"],
    ["2026-04-08", "Public Holiday"],
    ["2026-04-13", "Sinhala and Tamil New Year's Eve"],
    ["2026-04-14", "Sinhala and Tamil New Year's Day"],
    ["2026-04-15", "Public Holiday"],
    ["2026-05-01", "May Day"],
    ["2026-05-28", "Eid al-Adha"],
    ["2026-05-30", "Vesak Full Moon Poya Day"],
    ["2026-05-31", "Day after Vesak Full Moon Poya Day"],
    ["2026-06-29", "Poson Full Moon Poya Day"],
    ["2026-07-29", "Esala Full Moon Poya Day"],
    ["2026-08-26", "Milad-Un-Nabi"],
    ["2026-08-27", "Nikini Full Moon Poya Day"],
    ["2026-09-26", "Binara Full Moon Poya Day"],
    ["2026-10-25", "Vap Full Moon Poya Day"],
    ["2026-11-08", "Deepavali Festival Day"],
    ["2026-11-24", "Ill Full Moon Poya Day"],
    ["2026-12-23", "Unduvap Full Moon Poya Day"],
    ["2026-12-25", "Christmas Day"],
  ],
};

const holidayEntries = Object.fromEntries(
  Object.values(holidaysByYear)
    .flat()
    .map(([date, name]) => [date, { date, name }]),
);

export function getSriLankanHoliday(date) {
  return holidayEntries[date] || null;
}

export function getSriLankanHolidaysForMonth(period) {
  return (holidaysByYear[period?.slice(0, 4)] || [])
    .filter(([date]) => date.startsWith(`${period}-`))
    .map(([date, name]) => ({ date, name }));
}
