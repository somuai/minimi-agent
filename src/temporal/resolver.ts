export interface TemporalWindow {
  raw: string;
  start: Date;
  end: Date;
  startTimestamp: number;
  endTimestamp: number;
  confidence: number;
}

export class TemporalResolver {
  private static DAYS_OF_WEEK: Record<string, number> = {
    sunday: 0,
    sun: 0,
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
  };

  private static MONTHS: Record<string, number> = {
    january: 0,
    jan: 0,
    february: 1,
    feb: 1,
    march: 2,
    mar: 2,
    april: 3,
    apr: 3,
    may: 4,
    june: 5,
    jun: 5,
    july: 6,
    jul: 6,
    august: 7,
    aug: 7,
    september: 8,
    sep: 8,
    sept: 8,
    october: 9,
    oct: 9,
    november: 10,
    nov: 10,
    december: 11,
    dec: 11,
  };

  public static resolve(text: string, referenceDate: Date = new Date()): TemporalWindow[] {
    const windows: TemporalWindow[] = [];
    const normalized = text.toLowerCase();

    // 1. Explicit calendar date: e.g. "3 November", "3rd of November", "November 3", "Nov 3"
    const explicitDateRegex = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)(?:\s+(\d{4}))?\b/i;
    const explicitMatch = normalized.match(explicitDateRegex);
    if (explicitMatch) {
      const day = parseInt(explicitMatch[1], 10);
      const monthStr = explicitMatch[2].toLowerCase();
      const month = this.MONTHS[monthStr];
      const year = explicitMatch[3] ? parseInt(explicitMatch[3], 10) : referenceDate.getFullYear();

      const start = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
      const end = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
      windows.push({
        raw: explicitMatch[0],
        start,
        end,
        startTimestamp: start.getTime(),
        endTimestamp: end.getTime(),
        confidence: 0.95,
      });
    }

    // 2. Month first: e.g. "November 3", "Nov 3rd"
    const monthFirstRegex = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?\b/i;
    const monthFirstMatch = normalized.match(monthFirstRegex);
    if (monthFirstMatch && (!explicitMatch || monthFirstMatch.index !== explicitMatch.index)) {
      const monthStr = monthFirstMatch[1].toLowerCase();
      const month = this.MONTHS[monthStr];
      const day = parseInt(monthFirstMatch[2], 10);
      const year = monthFirstMatch[3] ? parseInt(monthFirstMatch[3], 10) : referenceDate.getFullYear();

      const start = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
      const end = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
      windows.push({
        raw: monthFirstMatch[0],
        start,
        end,
        startTimestamp: start.getTime(),
        endTimestamp: end.getTime(),
        confidence: 0.95,
      });
    }

    // 3. Days of the week: e.g. "last Tuesday", "on Monday", "this Monday"
    const dayOfWeekRegex = /\b(last|this|on|past)?\s*(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
    const dayMatch = normalized.match(dayOfWeekRegex);
    if (dayMatch) {
      const modifier = dayMatch[1]?.toLowerCase() || "past";
      const targetDayName = dayMatch[2].toLowerCase();
      const targetDay = this.DAYS_OF_WEEK[targetDayName];

      const currentDay = referenceDate.getDay();
      let diff = currentDay - targetDay;

      if (modifier === "last") {
        if (diff <= 0) diff += 7;
        diff += 7; // Previous week's day
      } else {
        if (diff <= 0) diff += 7;
      }

      const targetDate = new Date(referenceDate.getTime());
      targetDate.setDate(referenceDate.getDate() - diff);

      const start = new Date(Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0));
      const end = new Date(Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999));

      windows.push({
        raw: dayMatch[0].trim(),
        start,
        end,
        startTimestamp: start.getTime(),
        endTimestamp: end.getTime(),
        confidence: 0.9,
      });
    }

    // 4. Relative keywords: "yesterday", "today"
    if (normalized.includes("yesterday")) {
      const yesterday = new Date(referenceDate.getTime());
      yesterday.setDate(referenceDate.getDate() - 1);
      const start = new Date(Date.UTC(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 0, 0, 0, 0));
      const end = new Date(Date.UTC(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59, 999));
      windows.push({
        raw: "yesterday",
        start,
        end,
        startTimestamp: start.getTime(),
        endTimestamp: end.getTime(),
        confidence: 0.98,
      });
    }

    return windows;
  }
}
