import { createEntry } from '../src/core/recipe-engine';
import { calendarCells, countsByDate, currentStreak, monthCheckedCount, shiftDateKey, localDateKey } from '../src/core/checkin';
import type { InfoEntry } from '../src/core/models';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: got ${JSON.stringify(actual)}${ok ? '' : `, want ${JSON.stringify(expected)}`}`);
}

const T = '2026-10-05'; // 固定“今天”
const mk = (title: string, date: string): InfoEntry => createEntry(title, '文章', '深度知识', 20, '', date);

// 初始：9/30 ~ 10/5 每天一条 → 连续 6
let entries: InfoEntry[] = [
  mk('a', T),
  mk('b', shiftDateKey(T, -1)),
  mk('c', shiftDateKey(T, -2)),
  mk('d', shiftDateKey(T, -3)),
  mk('e', shiftDateKey(T, -4)),
  mk('f', shiftDateKey(T, -5)),
  mk('g', shiftDateKey(T, -10)), // 更早的一条，中间 10/4 前有空档
];
let counts = countsByDate(entries);
check('连续 6 天（含今天）', currentStreak(counts, T), 6);
check('本月打卡 6 天（10/1-10/5 + ... g 在 9/25）', monthCheckedCount(counts, T.slice(0, 7)), 5);
check('所有日期条数之和 = 餐盘总数', [...counts.values()].reduce((s, n) => s + n, 0), entries.length);
check('月历格子条数 = 落在显示区间内的记录数（含邻月填充，g 在 9/25 不显示）', calendarCells(counts, T.slice(0, 7), T).reduce((s, c) => s + c.count, 0), 6);

// 删除某天唯一一条（10/3）→ 回退未打卡并打断连续
entries = entries.filter((e) => e.title !== 'c');
counts = countsByDate(entries);
check('删除后 10/3 为 0 条', counts.get(shiftDateKey(T, -2)) ?? 0, 0);
check('删除中间日打断连续（只剩今明两天 = 2）', currentStreak(counts, T), 2);

// 删除今天唯一一条 → 今天未打卡，宽限从昨天回溯，连续仍可能保留
entries = entries.filter((e) => e.title !== 'a');
counts = countsByDate(entries);
check('今天 0 条时从昨天起算', currentStreak(counts, T), 1);

// 补录昨天（昨天也删过的场景：先把 b 删掉）
entries = entries.filter((e) => e.title !== 'b');
counts = countsByDate(entries);
check('昨天也删了 → 连续 0', currentStreak(counts, T), 0);
entries.push(mk('backfill', shiftDateKey(T, -1)));
counts = countsByDate(entries);
check('补录昨天 → 连续恢复为 1', currentStreak(counts, T), 1);

// 补录更早缺的那天（10/3），连续重新贯通 10/1-10/4 → 从昨天回溯为 4
entries.push(mk('backfill-c', shiftDateKey(T, -2)));
counts = countsByDate(entries);
check('补录 10/3 后连续恢复为 5（9/30..10/4，从昨天回溯）', currentStreak(counts, T), 5);

// 同一天多条：删掉一条仍打卡；删到最后一条才未打卡
entries.push(mk('a2', T));
entries.push(mk('a3', T));
counts = countsByDate(entries);
check('今天两条记录', counts.get(T), 2);
check('有今天记录时连续含今天 = 6', currentStreak(counts, T), 6);
const a2 = entries.find((e) => e.title === 'a2')!;
entries = entries.filter((e) => e.id !== a2.id);
counts = countsByDate(entries);
check('删掉今天一条仍打卡（剩 1）', counts.get(T), 1);
check('连续不变', currentStreak(counts, T), 6);
const a3 = entries.find((e) => e.title === 'a3')!;
entries = entries.filter((e) => e.id !== a3.id);
counts = countsByDate(entries);
check('删掉今天最后一条 → 今天未打卡，回退昨天回溯 = 5', currentStreak(counts, T), 5);

// 日历格子：有记录 checked=true、无记录 checked=false，数字与总数一致
counts = countsByDate(entries);
const cells = calendarCells(counts, T.slice(0, 7), T);
check('每个 checked 格子 count>0', cells.every((c) => c.checked === (c.count > 0)), true);
check('今天格子被标记', cells.find((c) => c.key === T)?.isToday, true);
check('未来格子 isFuture', cells.find((c) => c.key === shiftDateKey(T, 1))?.isFuture, true);
check('最终：所有日期条数之和 = 餐盘总数', [...counts.values()].reduce((s, n) => s + n, 0), entries.length);
check('最终：月历格子条数 = 显示区间内记录数（10/1-10/4 四条 + 邻月 9/30 一条）', cells.reduce((s, c) => s + c.count, 0), 5);
check('本地日期键格式', /^\d{4}-\d{2}-\d{2}$/.test(localDateKey(new Date(2026, 9, 5))), true);
check('本地日期键内容（非 UTC 偏移）', localDateKey(new Date(2026, 9, 5)), '2026-10-05');

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
