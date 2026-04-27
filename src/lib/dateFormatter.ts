const MONTH_MAP: Record<string, string> = {
    JAN: "01",
    FEB: "02",
    MAR: "03",
    APR: "04",
    MAY: "05",
    JUN: "06",
    JUL: "07",
    AUG: "08",
    SEP: "09",
    OCT: "10",
    NOV: "11",
    DEC: "12",
};

export function formatDate(raw?: string): string | undefined {
    if (!raw) return undefined;
    const parts = raw.trim().split(/\s+/);
    if (parts.length === 0) return undefined;

    if (parts.length === 1) {
        const year = parts[0];
        if (/^\d{4}$/.test(year)) return year;
        return raw;
    }

    if (parts.length === 2) {
        const [monthStr, year] = parts;
        const month = MONTH_MAP[(monthStr || "").toUpperCase()];
        if (month && /^\d{4}$/.test(year || "")) return `${year}/${month}`;
        return raw;
    }

    if (parts.length >= 3) {
        const day = parts[0];
        const monthStr = parts[1];
        const year = parts[2];
        const month = MONTH_MAP[(monthStr || "").toUpperCase()];
        const paddedDay = day?.padStart(2, "0");
        if (month && /^\d{4}$/.test(year || "") && /^\d{1,2}$/.test(day || "")) {
            return `${year}/${month}/${paddedDay}`;
        }
    }

    return raw;
}
