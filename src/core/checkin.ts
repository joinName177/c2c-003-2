import type { InfoEntry } from './models';

/** 以本地时区生成 YYYY-MM-DD 日期键（toISOString 按 UTC 切片，深夜会错到前一天） */
export function localDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function shiftDateKey(key: string, deltaDays: number): string {
  const [year, month, day] = key.split('-').map(Number);
  return localDateKey(new Date(year, month - 1, day + deltaDays));
}

export function shiftMonthKey(month: string, deltaMonths: number): string {
  const [year, monthIndex] = month.split('-').map(Number);
  return localDateKey(new Date(year, monthIndex - 1 + deltaMonths, 1)).slice(0, 7);
}

/**
 * 日期键 -> 当天记录条数。
 * 全应用只允许这一份按日统计：打卡日历、连续坚持、本月打卡都从它派生，
 * 保证日历数字与餐盘记录总数始终对得上。
 */
export function countsByDate(entries: InfoEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.date, (counts.get(entry.date) ?? 0) + 1);
  }
  return counts;
}

/**
 * 连续坚持天数：从今天起逐日回溯；今天还没打卡时宽限一天、从昨天起算
 * （这样补录一条昨天的记录就能恢复连续）。任意一天条数为 0 立即中断，
 * 所以删掉某一天最后一条记录会让那天回退为未打卡并打断连续。
 */
export function currentStreak(counts: ReadonlyMap<string, number>, today: string = localDateKey()): number {
  let cursor = (counts.get(today) ?? 0) > 0 ? today : shiftDateKey(today, -1);
  let streak = 0;
  while ((counts.get(cursor) ?? 0) > 0) {
    streak += 1;
    cursor = shiftDateKey(cursor, -1);
  }
  return streak;
}

/** 指定月份（YYYY-MM）中有记录的天数，即本月打卡天数 */
export function monthCheckedCount(counts: ReadonlyMap<string, number>, month: string): number {
  let total = 0;
  for (const [key, count] of counts) {
    if (key.startsWith(month) && count > 0) total += 1;
  }
  return total;
}

export interface CalendarCell {
  key: string;
  day: number;
  inMonth: boolean;
  checked: boolean;
  count: number;
  isToday: boolean;
  isFuture: boolean;
}

/** 以周一为每周起点生成月历格子；尾部整行全部落在下月时裁掉 */
export function calendarCells(
  counts: ReadonlyMap<string, number>,
  month: string,
  today: string = localDateKey(),
): CalendarCell[] {
  const [year, monthIndex] = month.split('-').map(Number);
  const firstDay = new Date(year, monthIndex - 1, 1);
  const firstKey = localDateKey(firstDay);
  const leading = (firstDay.getDay() + 6) % 7; // 周一为 0
  const startKey = shiftDateKey(firstKey, -leading);
  const cells: CalendarCell[] = Array.from({ length: 42 }, (_, index) => {
    const key = shiftDateKey(startKey, index);
    const count = counts.get(key) ?? 0;
    return {
      key,
      day: Number(key.slice(8, 10)),
      inMonth: key.startsWith(month),
      checked: count > 0,
      count,
      isToday: key === today,
      isFuture: key > today,
    };
  });
  while (cells.length > 7 && cells.slice(-7).every((cell) => !cell.inMonth)) {
    cells.splice(-7, 7);
  }
  return cells;
}
