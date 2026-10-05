<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { LocalRecipeRepository } from '../adapters/local-recipe.repository';
import { NUTRITION, NUTRITION_META, SOURCES, type InfoEntry, type NutritionType, type SourceType } from '../core/models';
import { createEntry, diagnoses, mealScore, metricsFor, sampleSnapshot } from '../core/recipe-engine';
import { calendarCells, countsByDate, currentStreak, localDateKey, monthCheckedCount, shiftDateKey, shiftMonthKey } from '../core/checkin';

const repo = new LocalRecipeRepository();
const state = reactive(repo.load());
const tabs = ['餐盘', '摄入', '打卡', '检测', '方案', '报告'] as const;
type Tab = (typeof tabs)[number];
const tab = ref<Tab>('餐盘');
const notice = ref('');
const draft = reactive({ title: '', source: '文章' as SourceType, nutrition: '深度知识' as NutritionType, minutes: 20, note: '', date: localDateKey() });
const maxDate = localDateKey();
const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

// 餐盘：从同一份 entries 派生
const metrics = computed(() => metricsFor(state.entries));
const score = computed(() => mealScore(metrics.value));
const findings = computed(() => diagnoses(metrics.value));
const totalMinutes = computed(() => state.entries.reduce((sum, item) => sum + item.minutes, 0));
const todayMinutes = computed(() => state.entries.filter((item) => item.date === maxDate).reduce((sum, item) => sum + item.minutes, 0));

// 打卡日历 / 连续坚持 / 本月打卡：全部从同一份 entries 派生，且共用同一份按日统计
const dayCounts = computed(() => countsByDate(state.entries));
const streak = computed(() => currentStreak(dayCounts.value, maxDate));
const monthCursor = ref(maxDate.slice(0, 7));
const monthChecked = computed(() => monthCheckedCount(dayCounts.value, monthCursor.value));
const cells = computed(() => calendarCells(dayCounts.value, monthCursor.value, maxDate));
const selectedKey = ref(maxDate);
const selectedEntries = computed(() => state.entries.filter((item) => item.date === selectedKey.value));
const selectedCount = computed(() => dayCounts.value.get(selectedKey.value) ?? 0);

// 时间线明细：同样从同一份 entries 派生，按日期分组
const timeline = computed(() => {
  const groups = new Map<string, InfoEntry[]>();
  for (const item of state.entries) {
    const list = groups.get(item.date);
    if (list) list.push(item);
    else groups.set(item.date, [item]);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, entries]) => ({ date, entries }));
});

function save() { repo.save({ entries: state.entries, dailyGoal: state.dailyGoal }); }
function addEntry() {
  const backfill = draft.date !== maxDate;
  state.entries.unshift(createEntry(draft.title, draft.source, draft.nutrition, draft.minutes, draft.note, draft.date));
  save();
  draft.title = ''; draft.note = ''; draft.date = maxDate;
  notice.value = backfill ? '补录成功，连续坚持天数与打卡日历已重新计算' : '摄入已记录，餐盘已重新计算';
  tab.value = backfill ? '打卡' : '餐盘';
}
function removeEntry(id: string) {
  const target = state.entries.find((item) => item.id === id);
  const wasLastOfDay = target !== undefined && (dayCounts.value.get(target.date) ?? 0) === 1;
  state.entries = state.entries.filter((item) => item.id !== id);
  save();
  notice.value = wasLastOfDay
    ? '删除的是当天唯一一条记录：当天已回退为未打卡，连续坚持天数已重算'
    : '记录已删除，餐盘、时间线明细与打卡日历已同步刷新';
}
function reset() {
  const fresh = sampleSnapshot();
  state.entries = fresh.entries;
  state.dailyGoal = fresh.dailyGoal;
  save();
  monthCursor.value = maxDate.slice(0, 7);
  selectedKey.value = maxDate;
  notice.value = '已恢复初始示例餐盘';
}
function changeMonth(delta: number) { monthCursor.value = shiftMonthKey(monthCursor.value, delta); }
function selectDay(key: string) {
  selectedKey.value = key;
  if (!key.startsWith(monthCursor.value)) monthCursor.value = key.slice(0, 7);
}
function goBackfill() {
  draft.date = selectedKey.value <= maxDate ? selectedKey.value : maxDate;
  tab.value = '摄入';
}
function openMonth(date: string) {
  selectedKey.value = date;
  monthCursor.value = date.slice(0, 7);
  tab.value = '打卡';
}
function dayLabel(date: string) {
  if (date === maxDate) return '今天';
  if (shiftDateKey(date, 1) === maxDate) return '昨天';
  return date;
}
const monthLabel = computed(() => `${monthCursor.value.replace('-', ' 年 ')} 月`);
</script>

<template>
  <div class="recipe-app"><header class="recipe-topbar"><div class="recipe-brand"><span class="recipe-mark">食</span><div><span class="eyebrow">ATTENTION KITCHEN / 03</span><h1>信息食谱调配师</h1></div></div><div class="recipe-actions"><span>今日已摄入 <b>{{ todayMinutes }}</b> min</span><span class="streak-pill" :class="{ on: streak > 0 }">连续坚持 <b>{{ streak }}</b> 天</span><button type="button" @click="reset">重置演示</button></div></header><main class="recipe-wrap"><section class="recipe-hero"><div><span class="eyebrow coral-text">YOUR DAILY INFORMATION DIET</span><h2>今天，给大脑<br /><em>配一份好食谱。</em></h2><p>信息也有营养密度。记录、咀嚼，再决定下一口要吃什么。</p></div><div class="daily-goal"><span>每日建议摄入</span><strong>{{ state.dailyGoal }}<small>min</small></strong><div><i :style="{ width: `${Math.min(100, todayMinutes / state.dailyGoal * 100)}%` }"></i></div><small>{{ Math.round(todayMinutes / state.dailyGoal * 100) }}% 完成</small></div></section><nav class="recipe-tabs"><button v-for="item in tabs" :key="item" type="button" :class="{ active: tab === item }" @click="tab = item">{{ item }}</button></nav>
      <section v-if="tab === '餐盘'" class="plate-layout"><article class="plate-panel"><div class="section-heading"><div><span class="eyebrow">TODAY'S PLATE</span><h3>今日信息餐盘</h3></div><span class="score-chip">营养均衡度 {{ score }}</span></div><div class="pyramid"><div class="pyramid-level level-1"><span>深度知识</span><b>{{ Math.round((metrics[0]?.share || 0) * 100) }}%</b></div><div class="pyramid-level level-2"><span>行业动态</span><span>技能提升</span></div><div class="pyramid-level level-3"><span>娱乐消遣</span><span>社交信息</span></div></div><div class="pyramid-note"><span>信息营养金字塔</span><p>底层是每天应该稳定摄入的深度内容，上层是有意识调味的轻内容。</p></div></article><aside class="plate-side"><div class="side-card"><span class="eyebrow">NUTRIENT SNAPSHOT</span><h4>营养快照</h4><div v-for="item in metrics" :key="item.nutrition" class="nutrient-row"><div><i :style="{ background: item.color }"></i><span>{{ item.nutrition }}</span></div><strong>{{ item.minutes }}<small>min</small></strong></div><p class="snapshot-total">共 {{ state.entries.length }} 条记录 · 累计 {{ totalMinutes }} min</p></div><div class="side-card insight-card"><span class="eyebrow">KITCHEN NOTE</span><p>“{{ findings[0] }}”</p><button type="button" @click="tab = '检测'">查看完整检测 →</button></div></aside></section>
      <section v-else-if="tab === '摄入'" class="intake-layout"><article class="intake-form"><div class="section-heading"><div><span class="eyebrow">ADD TO THE PLATE</span><h3>记录一次信息摄入</h3></div><span class="section-number">01 / 05</span></div><label>内容标题<input v-model="draft.title" placeholder="例如：一篇关于城市设计的文章" /></label><label>内容形式<select v-model="draft.source"><option v-for="source in SOURCES" :key="source" :value="source">{{ source }}</option></select></label><label>营养类别<select v-model="draft.nutrition"><option v-for="nutrition in NUTRITION" :key="nutrition" :value="nutrition">{{ nutrition }} · {{ NUTRITION_META[nutrition].hint }}</option></select></label><label>消费时长 <output>{{ draft.minutes }} 分钟</output><input v-model.number="draft.minutes" type="range" min="5" max="180" step="5" /></label><label>摄入日期<input v-model="draft.date" type="date" :max="maxDate" /><small class="field-hint">可补录昨天或更早的记录，保存后连续天数会自动恢复</small></label><label>备注（可选）<textarea v-model="draft.note" rows="3" placeholder="它给你带来了什么？"></textarea></label><button class="coral-button" type="button" @click="addEntry">{{ draft.date === maxDate ? '加入今日餐盘 →' : `补录到 ${draft.date} →` }}</button><p class="notice">{{ notice }}</p></article><article class="intake-list"><div class="section-heading"><div><span class="eyebrow">TIMELINE</span><h3>摄入时间线</h3></div><span class="section-number">共 {{ state.entries.length }} 条</span></div><div class="timeline"><div v-for="group in timeline" :key="group.date" class="timeline-day"><div class="timeline-date"><strong>{{ dayLabel(group.date) }}</strong><span>{{ group.date }} · {{ group.entries.length }} 条</span><button type="button" @click="openMonth(group.date)">查看日历</button></div><div class="bite-list"><div v-for="item in group.entries" :key="item.id" class="bite-row"><div class="bite-icon" :style="{ background: NUTRITION_META[item.nutrition].color }">{{ NUTRITION_META[item.nutrition].icon }}</div><div><strong>{{ item.title }}</strong><span>{{ item.source }} · {{ item.nutrition }} · {{ item.minutes }} min</span></div><button type="button" title="删除记录" @click="removeEntry(item.id)">×</button></div></div></div><p v-if="!timeline.length" class="empty-tip">还没有任何记录，去记录一次吧。</p></div></article></section>
      <section v-else-if="tab === '打卡'" class="checkin-layout"><article class="checkin-main"><div class="section-heading"><div><span class="eyebrow">CHECK-IN CALENDAR</span><h3>打卡日历</h3></div><div class="calendar-nav"><button type="button" @click="changeMonth(-1)">←</button><strong>{{ monthLabel }}</strong><button type="button" @click="changeMonth(1)">→</button></div></div><div class="checkin-stats"><div class="stat-card" :class="{ flame: streak > 0 }"><small>连续坚持</small><div><strong>{{ streak }}</strong><em>天</em></div><p>{{ streak > 0 ? '继续保持，别让连续断掉' : '今天记录一次即可开卡' }}</p></div><div class="stat-card"><small>本月打卡</small><div><strong>{{ monthChecked }}</strong><em>天</em></div><p>{{ monthLabel }}</p></div><div class="stat-card"><small>餐盘记录总数</small><div><strong>{{ state.entries.length }}</strong><em>条</em></div><p>日历每日条数之和与此始终一致</p></div></div><div class="calendar-legend"><span><i class="legend-dot checked"></i>已打卡 · 当天有记录</span><span><i class="legend-dot missing"></i>未打卡 · 当天无记录</span><span><i class="legend-dot today"></i>今天</span></div><div class="calendar-grid"><span v-for="w in weekdays" :key="w" class="calendar-weekday">{{ w }}</span><button v-for="cell in cells" :key="cell.key" type="button" class="calendar-cell" :class="{ checked: cell.checked, muted: !cell.inMonth, today: cell.isToday, selected: cell.key === selectedKey, future: cell.isFuture && !cell.checked }" @click="selectDay(cell.key)"><b>{{ cell.day }}</b><template v-if="cell.checked"><em class="cell-dot"></em><i class="cell-count">{{ cell.count }} 条</i></template><template v-else-if="!cell.isFuture"><i class="cell-miss">未打卡</i></template><template v-else><i class="cell-future">—</i></template></button></div></article><aside class="checkin-side"><div class="side-card day-detail"><span class="eyebrow">DAY DETAIL</span><h4>{{ selectedKey }}</h4><span class="day-status" :class="{ done: selectedCount > 0 }">{{ selectedKey > maxDate ? '这一天还没有到来' : selectedCount > 0 ? `已打卡 · ${selectedCount} 条记录` : '未打卡 · 当天没有任何记录' }}</span><div v-if="selectedEntries.length" class="day-entries"><div v-for="item in selectedEntries" :key="item.id" class="bite-row"><div class="bite-icon" :style="{ background: NUTRITION_META[item.nutrition].color }">{{ NUTRITION_META[item.nutrition].icon }}</div><div><strong>{{ item.title }}</strong><span>{{ item.source }} · {{ item.nutrition }} · {{ item.minutes }} min</span></div><button type="button" title="删除记录" @click="removeEntry(item.id)">×</button></div></div><div v-else-if="selectedKey <= maxDate" class="day-empty"><p>这一天没有任何记录，显示为未打卡。补录一条后连续天数会自动恢复。</p><button class="coral-button" type="button" @click="goBackfill">为这一天补录 →</button></div><p class="notice">{{ notice }}</p></div></aside></section>
      <section v-else-if="tab === '检测'" class="diagnosis-layout"><article class="diagnosis-main"><div class="section-heading"><div><span class="eyebrow">DIET DIAGNOSIS</span><h3>你的信息偏食检测</h3></div><span class="score-chip">{{ score }} / 100</span></div><div class="diagnosis-list"><div v-for="(item, index) in findings" :key="item" class="diagnosis-item"><span>0{{ index + 1 }}</span><div><strong>{{ item.includes('偏高') ? '摄入偏高' : item.includes('偏少') ? '长期缺失' : '整体平衡' }}</strong><p>{{ item }}</p></div><i>{{ item.includes('整体') ? '✓' : '!' }}</i></div></div></article><aside class="radar-card"><span class="eyebrow">BALANCE RADAR</span><h4>营养平衡雷达</h4><div class="radar-bars"><div v-for="item in metrics" :key="item.nutrition"><span>{{ item.nutrition }}</span><div><i :style="{ width: `${Math.min(100, item.share / item.target * 100)}%`, background: item.color }"></i></div><small>{{ Math.round(item.share * 100) }}%</small></div></div></aside></section>
      <section v-else-if="tab === '方案'" class="recipe-plan"><div class="section-heading"><div><span class="eyebrow">OPTIMIZED INFORMATION RECIPE</span><h3>下一周的信息食谱</h3></div><span class="section-number">基于最近 7 天</span></div><div class="meal-plan"><div v-for="(item, index) in metrics" :key="item.nutrition" class="meal-item"><span class="meal-time">{{ ['早餐', '上午茶', '午餐', '下午茶', '晚餐'][index] || '加餐' }}</span><div class="meal-color" :style="{ background: item.color }">{{ item.icon }}</div><div><strong>补充 {{ item.nutrition }}</strong><p>{{ item.nutrition === '深度知识' ? '找一篇能让你停下来做笔记的长文。' : item.nutrition === '技能提升' ? '把一个概念变成一次小练习。' : item.nutrition === '行业动态' ? '只选一个可信来源，了解发生了什么。' : item.nutrition === '娱乐消遣' ? '选择能真正让你恢复的轻内容。' : '发一条消息，认真回应一个人。' }}</p></div><span class="meal-duration">{{ Math.max(15, Math.round(item.target * state.dailyGoal)) }} min</span></div></div></section>
      <section v-else class="report-page"><div class="report-head"><span class="eyebrow">WEEKLY INTAKE REPORT · W40</span><h3>你的信息摄入报告</h3><p>信息不是越多越好，而是要吃得刚刚好。</p></div><div class="report-metrics"><div><span>总摄入</span><strong>{{ totalMinutes }}<small>min</small></strong></div><div><span>均衡度</span><strong>{{ score }}<small>/ 100</small></strong></div><div><span>最常摄入</span><strong>{{ metrics.slice().sort((a,b) => b.minutes-a.minutes)[0]?.nutrition }}</strong></div></div><div class="report-bars"><div v-for="item in metrics" :key="item.nutrition" class="report-bar"><div><span>{{ item.nutrition }}</span><b>{{ item.minutes }} min</b></div><div><i :style="{ width: `${Math.max(4, item.share * 100)}%`, background: item.color }"></i><em :style="{ left: `${item.target * 100}%` }"></em></div><small>建议 {{ Math.round(item.target * 100) }}%</small></div></div></section>
    </main></div>
</template>
