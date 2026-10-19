'use strict';

// ---------- storage & helpers ----------

const LS_KEY = 'calorie-tracker.v1';
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => { const x = parseFloat(v); return isNaN(x) ? 0 : x; };
const r1 = (x) => Math.round(x * 10) / 10;
const fmt = (x) => Math.round(x).toLocaleString('en-US');
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pad = (x) => (x < 10 ? '0' : '') + x;
const iso = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseIso = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseIso(s); d.setDate(d.getDate() + n); return iso(d); };
// a "logical" day runs until 4am, so a late-night snack still counts for the evening before
const logicalToday = () => iso(new Date(Date.now() - 4 * 3600e3));
const dayName = (s, long) => parseIso(s).toLocaleDateString('en-GB', long
  ? { weekday: 'long', day: 'numeric', month: 'long' }
  : { weekday: 'short', day: 'numeric', month: 'short' });

const DEFAULT_SETTINGS = {
  kcalTarget: 2400, kcalLow: 2300, kcalHigh: 2500,
  proteinTarget: 145, fatTarget: 43, carbsTarget: 358,
  slots: 'Breakfast,Lunch,Preworkout,Dinner,Late Night'
};

const ICON = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>'
};

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { /* private mode or corrupt */ }
  s = s || {};
  s.state = normalize(s.state || {});
  s.queue = s.queue || [];
  return s;
}

function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(S)); } catch (e) { /* storage full or blocked */ }
}

function normalize(st) {
  const settings = Object.assign({}, DEFAULT_SETTINGS, st.settings || {});
  ['kcalTarget', 'kcalLow', 'kcalHigh', 'proteinTarget', 'fatTarget', 'carbsTarget'].forEach((k) => { settings[k] = num(settings[k]); });
  if (!settings.openDay) settings.openDay = logicalToday();
  return {
    foods: (st.foods || []).map((f) => Object.assign(f, { kcal: num(f.kcal), protein: num(f.protein), carbs: num(f.carbs), fat: num(f.fat), grams: num(f.grams) })),
    meals: (st.meals || []).map((m) => Object.assign(m, { items: Array.isArray(m.items) ? m.items : JSON.parse(m.items || '[]') })),
    log: (st.log || []).map((l) => Object.assign(l, { qty: num(l.qty) || 1, kcal: num(l.kcal), protein: num(l.protein), carbs: num(l.carbs), fat: num(l.fat), grams: num(l.grams), ts: num(l.ts) })),
    days: st.days || [],
    settings
  };
}

const S = load();
let tab = 'today';

// first open from the setup link: #setup=<base64 {u,k}>
(function readSetupLink() {
  const m = location.hash.match(/setup=([^&]+)/);
  if (!m) return;
  try {
    const cfg = JSON.parse(atob(decodeURIComponent(m[1]).replace(/-/g, '+').replace(/_/g, '/')));
    if (cfg.u && cfg.k) { S.cfg = cfg; save(); }
  } catch (e) { /* bad link, ignore */ }
  // keep the hash: iOS "Add to Home Screen" saves this URL, and the home-screen app has its own storage
})();

// ---------- data access ----------

const st = () => S.state;
const set = () => st().settings;
const slots = () => String(set().slots).split(',').map((s) => s.trim()).filter(Boolean);
const openDay = () => set().openDay;
const foodById = (id) => st().foods.find((f) => f.id === id);
const dayItems = (date) => st().log.filter((l) => l.date === date).sort((a, b) => a.ts - b.ts);
const totals = (items) => items.reduce((t, l) => ({ kcal: t.kcal + l.kcal, protein: t.protein + l.protein, carbs: t.carbs + l.carbs, fat: t.fat + l.fat }), { kcal: 0, protein: 0, carbs: 0, fat: 0 });

function usage() {
  const u = {};
  st().log.forEach((l) => { if (l.foodId) u[l.foodId] = (u[l.foodId] || 0) + 1; });
  st().meals.forEach((m) => m.items.forEach((i) => { u[i.foodId] = (u[i.foodId] || 0) + 1; }));
  return u;
}

function mealTotals(meal) {
  return meal.items.reduce((t, i) => {
    const f = foodById(i.foodId);
    if (!f) return t;
    return { kcal: t.kcal + f.kcal * i.qty, protein: t.protein + f.protein * i.qty, carbs: t.carbs + f.carbs * i.qty, fat: t.fat + f.fat * i.qty };
  }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}

// weighed foods: nutrition is stored for f.grams (normally 100 g); qty = grams eaten / f.grams
const per100 = (f, k) => (f.grams ? f[k] / f.grams * 100 : f[k]);
function lastGrams(f) {
  if (!f.grams) return 0;
  let best = null;
  if (f.id) st().log.forEach((l) => { if (l.foodId === f.id && l.grams > 0 && (!best || l.date > best.date || (l.date === best.date && l.ts > best.ts))) best = l; });
  return best ? r1(best.grams) : (f.serving || f.grams);
}
const usualQty = (f) => (f.grams ? lastGrams(f) / f.grams : 1);
// "Striploin 200g" -> 200
const parseGrams = (q) => { const m = String(q || '').match(/(\d+(?:\.\d+)?)\s*(g|gm|grams?)\b/i); return m ? num(m[1]) : 0; };
const qWords = (q) => String(q || '').toLowerCase().replace(/[(),/]/g, ' ').split(/\s+/).filter((w) => w && !/^\d+(\.\d+)?(g|gm|grams?|kg|ml)?$/.test(w));

// built-in database (fooddb.js), values per 100 g
function dbSearch(q) {
  const words = qWords(q).filter((w) => w.length >= 2);
  if (!words.length || typeof FOOD_DB === 'undefined') return [];
  return FOOD_DB.map((r, i) => {
    const hay = (r[0] + ' ' + r[1]).toLowerCase().split(/[^a-z0-9%]+/);
    let score = 0;
    words.forEach((w) => { if (hay.some((h) => h.startsWith(w))) score += w.length >= 4 ? 2 : 1; });
    return { i, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || a.i - b.i).map((x) => x.i);
}
const dbFood = (i) => { const r = FOOD_DB[i]; return { id: '', db: true, name: r[0], kcal: r[2], protein: r[3], carbs: r[4], fat: r[5], grams: 100, serving: r[6] }; };

function logRowFromFood(f, qty, slot, extra) {
  return Object.assign({
    id: uid('l'), date: openDay(), slot, name: f.name, qty,
    kcal: r1(f.kcal * qty), protein: r1(f.protein * qty), carbs: r1(f.carbs * qty), fat: r1(f.fat * qty),
    grams: r1((f.grams || 0) * qty), foodId: f.id || '', mealId: '', ts: Date.now()
  }, extra || {});
}

// ---------- operations: applied locally right away, then sent to the sheet ----------

function applyLocal(op) {
  const s = st(), d = op.data;
  const upsert = (arr, key, obj) => { const i = arr.findIndex((x) => x[key] === obj[key]); if (i >= 0) arr[i] = obj; else arr.push(obj); };
  const remove = (arr, id) => { const i = arr.findIndex((x) => x.id === id); if (i >= 0) arr.splice(i, 1); };
  switch (op.type) {
    case 'log.put': upsert(s.log, 'id', Object.assign({}, d)); break;
    case 'log.del': remove(s.log, d.id); break;
    case 'food.put': upsert(s.foods, 'id', Object.assign({}, d)); break;
    case 'food.del': remove(s.foods, d.id); break;
    case 'meal.put': upsert(s.meals, 'id', Object.assign({}, d, { items: d.items.slice() })); break;
    case 'meal.del': remove(s.meals, d.id); break;
    case 'settings.put': Object.assign(s.settings, d); break;
    case 'day.close': upsert(s.days, 'date', Object.assign({}, d.summary)); s.settings.openDay = d.next; break;
  }
}

function commit(ops) {
  ops = Array.isArray(ops) ? ops : [ops];
  ops.forEach((o) => { o.opId = uid('o'); applyLocal(o); S.queue.push(o); });
  if (ops.some((o) => /^(log|food)\./.test(o.type))) autoMealOps().forEach((o) => { o.opId = uid('o'); applyLocal(o); S.queue.push(o); });
  save();
  render();
  scheduleFlush();
}

// ---------- sync with the Google Sheet ----------

let flushing = false, flushTimer = null;
function scheduleFlush(ms) { clearTimeout(flushTimer); flushTimer = setTimeout(flush, ms == null ? 400 : ms); }

async function post(body) {
  const res = await fetch(S.cfg.u, { method: 'POST', body: JSON.stringify(Object.assign({ k: S.cfg.k }, body)), headers: { 'Content-Type': 'text/plain;charset=utf-8' } });
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || 'sync failed');
  return j;
}

async function flush() {
  if (!S.cfg || flushing || !S.queue.length) return;
  flushing = true;
  const batch = S.queue.slice(0, 40);
  try {
    const j = await post({ ops: batch });
    const done = new Set(j.done);
    S.queue = S.queue.filter((o) => !done.has(o.opId));
    S.lastSync = Date.now();
    S.syncErr = '';
    save();
  } catch (e) {
    S.syncErr = navigator.onLine ? "Couldn't reach the sheet" : 'Offline';
  }
  flushing = false;
  renderSync();
  if (S.queue.length && !S.syncErr) scheduleFlush(50);
}

async function pull() {
  if (!S.cfg) return;
  await flush();
  if (S.queue.length || flushing) return; // never overwrite changes the sheet hasn't got yet
  try {
    const j = await post({ ops: [], read: true });
    S.state = normalize(j.state);
    const auto = autoMealOps();
    if (auto.length) commit(auto);
    S.lastSync = Date.now();
    S.syncErr = '';
    save();
    if (!sheetOpen()) render(); else renderSync();
  } catch (e) {
    S.syncErr = navigator.onLine ? "Couldn't reach the sheet" : 'Offline';
    renderSync();
  }
}

function renderSync() {
  const el = $('#sync');
  el.className = 'sync';
  if (!S.cfg) { el.textContent = 'Saved on this phone only. Open the setup link to connect the Google Sheet.'; el.classList.add('err'); return; }
  if (S.syncErr) {
    el.textContent = S.syncErr + (S.queue.length ? ` · ${S.queue.length} change${S.queue.length > 1 ? 's' : ''} waiting` : '');
    el.classList.add('err');
    return;
  }
  el.textContent = S.queue.length ? 'Saving to sheet…' : '';
}

window.addEventListener('online', () => flush());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') pull(); });
setInterval(() => { if (S.queue.length) flush(); }, 20000);

// ---------- top-level rendering ----------

function render() {
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const top = { eyebrow: '', title: '', actions: '' };
  let html = '';
  if (tab === 'today') html = viewToday(top);
  if (tab === 'meals') html = viewMeals(top);
  if (tab === 'foods') html = viewFoods(top);
  if (tab === 'history') html = viewHistory(top);
  $('#top-eyebrow').textContent = top.eyebrow;
  $('#top-title').textContent = top.title;
  $('#top-actions').innerHTML = top.actions;
  const view = $('#view');
  const q = view.querySelector('input[data-search]');
  const keep = q && document.activeElement === q ? q.selectionStart : null;
  view.innerHTML = html;
  if (keep !== null) { const n = view.querySelector('input[data-search]'); if (n) { n.focus(); n.setSelectionRange(keep, keep); } }
  renderSync();
}

function ringHtml(t, target) {
  const C = 2 * Math.PI * 54;
  const pct = target ? t.kcal / target : 0;
  return `<div class="ring ${t.kcal > set().kcalHigh ? 'over' : ''}">
    <svg viewBox="0 0 132 132"><circle class="trk" cx="66" cy="66" r="54"/><circle class="val" cx="66" cy="66" r="54" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - Math.min(pct, 1))}"/></svg>
    <div class="ring-label"><div class="big num">${fmt(t.kcal)}</div><div class="small">of ${fmt(target)} kcal</div></div>
  </div>`;
}

function macroBars(t) {
  const s = set();
  return [['Protein', 'protein', s.proteinTarget], ['Carbs', 'carbs', s.carbsTarget], ['Fat', 'fat', s.fatTarget]].map(([label, k, target]) => `
    <div>
      <div class="macro-top"><b>${label}</b><span class="num">${fmt(t[k])} / ${fmt(target)} g</span></div>
      <div class="bar"><i style="width:${Math.min(100, target ? t[k] / target * 100 : 0)}%;background:var(--${k})"></i></div>
    </div>`).join('');
}

function summaryCard(t) {
  const s = set();
  const left = s.kcalTarget - t.kcal;
  const pLeft = s.proteinTarget - t.protein;
  return `<div class="card summary">
    ${ringHtml(t, s.kcalTarget)}
    <div class="macros">${macroBars(t)}</div>
    <div class="left-line">
      <span>${left >= 0 ? `<b class="num">${fmt(left)}</b> kcal left` : `<b class="num" style="color:var(--warn)">${fmt(-left)}</b> kcal over`}</span>
      <span>${pLeft > 0 ? `<b class="num">${fmt(pLeft)} g</b> protein to go` : '<b style="color:var(--good)">Protein hit</b>'}</span>
    </div>
  </div>`;
}

function viewToday(top) {
  const day = openDay();
  top.eyebrow = day === logicalToday() ? 'Today' : 'Day still open';
  top.title = dayName(day);
  top.actions = '<button class="pill" data-act="end-day">End day</button>';
  const items = dayItems(day);
  let html = '';
  if (logicalToday() > day) {
    html += `<div class="banner"><div>It's <b>${esc(dayName(logicalToday()))}</b> now. You're still logging <b>${esc(dayName(day))}</b>. Tap <b>End day</b> when you're done with it.</div></div>`;
  }
  html += summaryCard(totals(items));
  slots().forEach((slot) => {
    const list = items.filter((l) => l.slot === slot);
    const t = totals(list);
    html += `<section class="card slot">
      <div class="slot-head">
        <h2>${esc(slot)}</h2>
        <span class="meta num">${list.length ? `${fmt(t.kcal)} kcal · ${fmt(t.protein)} g P` : ''}</span>
        ${list.length ? `<button class="slot-more" data-act="slot-menu" data-slot="${esc(slot)}" aria-label="More">${ICON.more}</button>` : ''}
        <button class="slot-add" data-act="add" data-slot="${esc(slot)}" aria-label="Add to ${esc(slot)}">${ICON.plus}</button>
      </div>
      ${list.map(itemRow).join('') || '<div class="empty-slot">Nothing yet</div>'}
    </section>`;
  });
  // items in a slot that no longer exists still show up
  const other = items.filter((l) => !slots().includes(l.slot));
  if (other.length) html += `<section class="card slot"><div class="slot-head"><h2>Other</h2></div>${other.map(itemRow).join('')}</section>`;
  return html;
}

function itemRow(l) {
  const sub = [l.grams ? `${fmt(l.grams)} g` : '', `C ${fmt(l.carbs)} · F ${fmt(l.fat)}`].filter(Boolean).join(' · ');
  return `<button class="item" data-act="item" data-id="${esc(l.id)}">
    <div class="name"><div>${esc(l.name)}${l.qty !== 1 && !l.grams ? `<span class="qty">×${r1(l.qty)}</span>` : ''}</div><div class="sub num">${sub}</div></div>
    <div class="kc num">${fmt(l.kcal)}<small>${fmt(l.protein)} g P</small></div>
  </button>`;
}

function searchBox(value, ph) {
  return `<label class="search">${ICON.search}<input data-search type="search" placeholder="${esc(ph)}" value="${esc(value)}" autocomplete="off" autocorrect="off" spellcheck="false"></label>`;
}
const matches = (name, q) => qWords(q).every((w) => name.toLowerCase().includes(w));

let foodsQuery = '';
let foodSel = null; // Set of selected food ids while in select mode
function viewFoods(top) {
  top.title = 'Foods';
  top.eyebrow = `${st().foods.length} saved`;
  top.actions = foodSel
    ? '<button class="pill" data-act="sel-cancel">Cancel</button>'
    : `<button class="pill ghost" data-act="sel-start">Select</button><button class="icon-btn" data-act="food-new" aria-label="New food">${ICON.plus}</button>`;
  const u = usage();
  const list = st().foods.filter((f) => matches(f.name, foodsQuery)).sort((a, b) => (u[b.id] || 0) - (u[a.id] || 0) || a.name.localeCompare(b.name));
  let html = searchBox(foodsQuery, 'Search foods');
  if (foodSel) {
    html += foodSel.size
      ? `<button class="btn danger" style="margin-bottom:10px" data-act="sel-delete">Delete ${foodSel.size} food${foodSel.size > 1 ? 's' : ''}</button>`
      : '<div class="form-note" style="margin:0 6px 10px">Tap the foods you want to remove.</div>';
  }
  html += list.length ? `<div class="card list">${list.map((f) => `
      <button class="row" data-act="${foodSel ? 'sel-toggle' : 'food-edit'}" data-id="${esc(f.id)}">
        ${foodSel ? `<span class="sel-dot ${foodSel.has(f.id) ? 'on' : ''}">${ICON.check}</span>` : ''}
        <div class="name"><div class="title">${esc(f.name)}</div><div class="sub num">${foodSub(f)}</div></div>
        <div class="right num">${fmt(per100(f, 'kcal'))}<small>kcal</small></div>
      </button>`).join('')}</div>` : '<div class="hint">No saved foods match.</div>';
  if (!foodSel && foodsQuery) html += dbRows(foodsQuery, 'db-save');
  return html;
}
const foodSub = (f) => (f.grams ? 'per 100 g · ' : 'per serving · ') + `P ${r1(per100(f, 'protein'))} · C ${r1(per100(f, 'carbs'))} · F ${r1(per100(f, 'fat'))}`;

function dbRows(q, act) {
  const hits = dbSearch(q).slice(0, 8);
  if (!hits.length) return '';
  return `<div class="section-label">Food database · per 100 g</div><div class="card list">${hits.map((i) => {
    const f = dbFood(i);
    return `<button class="row" data-act="${act}" data-i="${i}">
      <div class="name"><div class="title">${esc(f.name)}</div><div class="sub num">P ${r1(f.protein)} · C ${r1(f.carbs)} · F ${r1(f.fat)}</div></div>
      <div class="right num">${fmt(f.kcal)}<small>kcal</small></div>
    </button>`;
  }).join('')}</div>`;
}

function viewMeals(top) {
  top.title = 'Meals';
  top.eyebrow = 'Foods you eat together';
  top.actions = `<button class="icon-btn" data-act="meal-new" aria-label="New meal">${ICON.plus}</button>`;
  const meals = st().meals;
  if (!meals.length) return '<div class="hint">No meals yet. As soon as a meal time has 2 or more foods (your breakfast, lunch…), it is saved here by itself and kept up to date as you log, ready to add again with one tap. You can also tap + to make one.</div>';
  let html = '';
  slots().concat(['']).forEach((slot) => {
    const list = meals.filter((m) => (slot ? m.slot === slot : !slots().includes(m.slot)));
    if (!list.length) return;
    html += `<div class="section-label">${esc(slot || 'Any time')}</div><div class="card list">${list.map(mealRow).join('')}</div>`;
  });
  return html;
}

function mealRow(m, inAdd, done) {
  const t = mealTotals(m);
  return `<div class="row" data-act="meal-edit" data-id="${esc(m.id)}" role="button">
    <div class="name"><div class="title">${esc(m.name)}</div><div class="sub num">${inAdd ? esc(m.slot) + ' · ' : ''}${m.items.length} item${m.items.length > 1 ? 's' : ''} · ${fmt(t.protein)} g P · C ${fmt(t.carbs)} · F ${fmt(t.fat)}</div></div>
    <div class="right num">${fmt(t.kcal)}<small>kcal</small></div>
    ${inAdd ? `<button class="add-dot ${done ? 'done' : ''}" data-act="add-meal" data-id="${esc(m.id)}" aria-label="Add meal">${done ? ICON.check : ICON.plus}</button>` : ''}
  </div>`;
}

function dayTotalsFor(date) {
  const items = dayItems(date);
  if (items.length) return totals(items);
  const d = st().days.find((x) => x.date === date);
  return d ? { kcal: num(d.kcal), protein: num(d.protein), carbs: num(d.carbs), fat: num(d.fat) } : totals([]);
}

function pastDates() {
  const dates = new Set(st().days.map((d) => d.date));
  st().log.forEach((l) => dates.add(l.date));
  dates.delete(openDay());
  return [...dates].sort().reverse();
}

function kcalColor(k) {
  const s = set();
  if (k > s.kcalHigh) return 'var(--warn)';
  if (k >= s.kcalLow) return 'var(--good)';
  return 'var(--faint)';
}

function viewHistory(top) {
  top.title = 'History';
  top.eyebrow = '';
  top.actions = `<button class="icon-btn" data-act="settings" aria-label="Settings">${ICON.gear}</button>`;
  const dates = pastDates();
  if (!dates.length) return '<div class="hint">Days you finish show up here.</div>';
  const last7 = dates.slice(0, 7).map(dayTotalsFor);
  const avg = (k) => last7.reduce((a, t) => a + t[k], 0) / last7.length;
  let html = `<div class="stats">
    <div class="card stat"><div class="k">Avg calories, last ${last7.length} days</div><div class="v num" style="color:${kcalColor(avg('kcal'))}">${fmt(avg('kcal'))}</div></div>
    <div class="card stat"><div class="k">Avg protein</div><div class="v num">${fmt(avg('protein'))}<small> g</small></div></div>
  </div>`;
  let month = '';
  let open = false;
  dates.forEach((date) => {
    const m = parseIso(date).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    if (m !== month) {
      if (open) html += '</div>';
      html += `<div class="section-label">${esc(m)}</div><div class="card list">`;
      month = m;
      open = true;
    }
    const t = dayTotalsFor(date);
    html += `<button class="row" data-act="day" data-date="${date}">
      <div class="name"><div class="title"><span class="chip-dot" style="background:${kcalColor(t.kcal)}"></span>${esc(dayName(date))}</div><div class="sub num">P ${fmt(t.protein)} · C ${fmt(t.carbs)} · F ${fmt(t.fat)}</div></div>
      <div class="right num">${fmt(t.kcal)}<small>kcal</small></div>
    </button>`;
  });
  if (open) html += '</div>';
  return html;
}

// ---------- bottom sheets ----------

const sheetStack = [];
const sheetOpen = () => sheetStack.length > 0;

function openSheet(fn, opts) {
  sheetStack.push({ fn, opts: opts || {} });
  drawSheet();
}
function drawSheet() {
  const top = sheetStack[sheetStack.length - 1];
  const sh = $('#sheet');
  if (!top) { closeSheets(); return; }
  const r = top.fn();
  sh.className = 'sheet on' + (top.opts.tall ? ' tall' : '');
  const back = sheetStack.length > 1 ? '<button class="pill ghost" data-act="sheet-back">Back</button>' : '';
  sh.innerHTML = `<div class="sheet-head">${back}<h3>${esc(r.title)}</h3>${r.action || '<button class="pill ghost" data-act="sheet-close">Done</button>'}</div><div class="sheet-body">${r.body}</div>`;
  $('#scrim').classList.add('on');
  $('#toast').classList.add('high');
  if (r.after) r.after(sh);
}
function redrawSheet(keepScroll) {
  const body = $('#sheet .sheet-body');
  const y = body ? body.scrollTop : 0;
  const active = document.activeElement;
  const focusKey = active && active.closest('#sheet') ? active.getAttribute('data-k') || (active.hasAttribute('data-search') ? 'search' : null) : null;
  const caret = focusKey && active.selectionStart != null ? active.selectionStart : null;
  drawSheet();
  if (keepScroll !== false) { const b = $('#sheet .sheet-body'); if (b) b.scrollTop = y; }
  if (focusKey) {
    const el = focusKey === 'search' ? $('#sheet input[data-search]') : $(`#sheet [data-k="${focusKey}"]`);
    if (el) { el.focus(); if (caret != null && el.setSelectionRange) try { el.setSelectionRange(caret, caret); } catch (e) { /* number inputs */ } }
  }
}
function popSheet() { sheetStack.pop(); if (sheetStack.length) drawSheet(); else closeSheets(); }
function closeSheets() {
  sheetStack.length = 0;
  $('#sheet').className = 'sheet';
  $('#scrim').classList.remove('on');
  $('#toast').classList.remove('high');
  if (document.activeElement) document.activeElement.blur();
  render();
}

// ----- add to a meal slot -----

const addState = { slot: '', mode: 'meals', q: '', justAdded: {} };

function openAdd(slot) {
  addState.slot = slot;
  addState.q = '';
  addState.justAdded = {};
  if (!st().meals.some((m) => m.slot === slot)) addState.mode = 'foods';
  openSheet(sheetAdd, { tall: true });
}

function sheetAdd() {
  const a = addState;
  const chips = slots().map((s) => `<button class="chip ${s === a.slot ? 'on' : ''}" data-act="add-slot" data-slot="${esc(s)}">${esc(s)}</button>`).join('');
  const seg = [['meals', 'Meals'], ['foods', 'Foods'], ['past', 'Past days']].map(([k, l]) => `<button class="${a.mode === k ? 'on' : ''}" data-act="add-mode" data-mode="${k}">${l}</button>`).join('');
  let body = `<div class="chips">${chips}</div><div class="seg">${seg}</div>`;
  if (a.mode !== 'past') body += searchBox(a.q, a.mode === 'meals' ? 'Search meals' : 'Search foods');
  if (a.mode === 'meals') {
    const list = st().meals.filter((m) => matches(m.name, a.q)).sort((x, y) => (y.slot === a.slot) - (x.slot === a.slot));
    body += list.length ? `<div class="card list">${list.map((m) => mealRow(m, true, a.justAdded[m.id])).join('')}</div>`
      : '<div class="hint">No saved meals yet. They save themselves once a meal time has 2 or more foods, or tap ⋯ on a meal in Today › Save as a meal.</div>';
  } else if (a.mode === 'foods') {
    const u = usage();
    const list = st().foods.filter((f) => matches(f.name, a.q)).sort((x, y) => (u[y.id] || 0) - (u[x.id] || 0) || x.name.localeCompare(y.name));
    body += `<div class="card list">
      <button class="row" data-act="custom"><div class="name"><div class="title" style="color:var(--accent)">${a.q ? `Add “${esc(a.q)}” as a new food` : 'New food or one-off entry'}</div><div class="sub">Type in the label's numbers</div></div></button>
      ${list.slice(0, 120).map((f) => {
        const q = usualQty(f);
        return `
      <div class="row" data-act="food-amount" data-id="${esc(f.id)}" role="button">
        <div class="name"><div class="title">${esc(f.name)}</div><div class="sub num">${f.grams ? `${fmt(f.grams * q)} g · ` : ''}P ${fmt(f.protein * q)} · C ${fmt(f.carbs * q)} · F ${fmt(f.fat * q)}</div></div>
        <div class="right num">${fmt(f.kcal * q)}<small>kcal</small></div>
        <button class="add-dot ${a.justAdded[f.id] ? 'done' : ''}" data-act="add-food" data-id="${esc(f.id)}" aria-label="Add">${a.justAdded[f.id] ? ICON.check : ICON.plus}</button>
      </div>`;
      }).join('')}</div>`;
    if (a.q) body += dbRows(a.q, 'db-amount');
  } else {
    const dates = pastDates().slice(0, 21);
    if (!dates.length) body += '<div class="hint">No past days yet.</div>';
    dates.forEach((date) => {
      const items = dayItems(date);
      if (!items.length) return;
      const t = totals(items);
      body += `<div class="section-label">${esc(dayName(date))} · <span class="num">${fmt(t.kcal)}</span> kcal</div><div class="card list">`;
      slots().forEach((slot) => {
        const list = items.filter((l) => l.slot === slot);
        if (!list.length) return;
        const st2 = totals(list);
        const key = date + '|' + slot;
        body += `<div class="row">
          <div class="name"><div class="title">${esc(slot)}: ${esc(summariseItems(list))}</div><div class="sub num">${fmt(st2.kcal)} kcal · ${fmt(st2.protein)} g P</div></div>
          <button class="add-dot ${a.justAdded[key] ? 'done' : ''}" data-act="add-past" data-date="${date}" data-slot="${esc(slot)}" aria-label="Add">${a.justAdded[key] ? ICON.check : ICON.plus}</button>
        </div>`;
      });
      body += `<button class="row" data-act="copy-day" data-date="${date}"><div class="name"><div class="title" style="color:var(--accent)">Copy this whole day into today</div></div></button></div>`;
    });
  }
  const today = totals(dayItems(openDay()));
  return { title: 'Add to ' + a.slot, body, action: `<button class="pill solid" data-act="sheet-close"><span class="num">${fmt(today.kcal)} kcal</span> · Done</button>` };
}

// every meal time in the open day with 2+ saved foods is kept as a one-tap meal, updated as you log.
// It lives under its own id (auto-<date>-<slot>); if an older meal has the same slot and foods,
// that one takes today's amounts instead, so repeats don't pile up. Returns only the ops that change something.
function autoMealOps() {
  const day = openDay();
  const ops = [];
  const rows = dayItems(day);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const foodKey = (items) => items.map((i) => i.foodId).sort().join(',');
  slots().concat([...new Set(rows.map((l) => l.slot))]).filter((x, i, a) => a.indexOf(x) === i).forEach((slot) => {
    const ownId = `auto-${day}-${slot}`;
    const own = st().meals.find((m) => m.id === ownId);
    const items = [];
    rows.filter((l) => l.slot === slot && l.foodId && foodById(l.foodId)).forEach((l) => {
      const ex = items.find((i) => i.foodId === l.foodId);
      if (ex) ex.qty = r1(ex.qty + l.qty); else items.push({ foodId: l.foodId, qty: l.qty });
    });
    const twin = items.length >= 2 && st().meals.find((m) => m.id !== ownId && m.slot === slot && foodKey(m.items) === foodKey(items));
    const target = items.length < 2 ? null : twin || own;
    if (own && own !== target) ops.push({ type: 'meal.del', data: { id: own.id } });
    if (items.length < 2) return;
    const autoName = (list) => list.map((i) => (foodById(i.foodId) || {}).name).join(', ');
    // a renamed meal keeps its name; one still on its automatic name follows the foods
    const name = target && target.name && (target === twin || target.name !== autoName(target.items)) ? target.name : autoName(items);
    const meal = { id: target ? target.id : ownId, name, slot, items };
    if (!target || !same(target.items, items) || target.name !== meal.name) ops.push({ type: 'meal.put', data: meal });
  });
  return ops;
}

function summariseItems(list) {
  const counts = [];
  list.forEach((l) => {
    const c = counts.find((x) => x.name === l.name);
    if (c) c.n += l.qty; else counts.push({ name: l.name, n: l.qty });
  });
  return counts.map((c) => c.name + (c.n !== 1 ? ' ×' + r1(c.n) : '')).join(', ');
}

function saveDbFood(f) {
  const food = { id: uid('f'), name: f.name, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, grams: 100, uses: 0 };
  commit({ type: 'food.put', data: food });
  return food;
}

function addFoodNow(food, qty, slot) {
  const row = logRowFromFood(food, qty, slot);
  commit({ type: 'log.put', data: row });
  return [row];
}

function addMealNow(meal, slot) {
  const rows = [];
  let ts = Date.now();
  meal.items.forEach((i) => {
    const f = foodById(i.foodId);
    if (f) rows.push(logRowFromFood(f, i.qty, slot, { mealId: meal.id, ts: ts++ }));
  });
  commit(rows.map((r) => ({ type: 'log.put', data: r })));
  return rows;
}

function copyItems(list, slot) {
  let ts = Date.now();
  const rows = list.map((l) => Object.assign({}, l, { id: uid('l'), date: openDay(), slot: slot || l.slot, ts: ts++ }));
  commit(rows.map((r) => ({ type: 'log.put', data: r })));
  return rows;
}

function undoRows(rows, label) {
  toast(label, () => commit(rows.map((r) => ({ type: 'log.del', data: { id: r.id } }))));
}

// ----- one food: pick an amount -----

// weighed foods ask only for grams; per-serving foods (restaurant meals etc.) ask for servings
function amountFields(state, unitGrams) {
  if (unitGrams) return `<div class="card form">
    <div class="field"><label>Weight</label>
      <div class="stepper"><button data-act="g-step" data-d="-10">−</button><input data-k="grams" type="number" inputmode="decimal" min="0" value="${r1(unitGrams * state.qty)}"><button data-act="g-step" data-d="10">+</button></div>
      <span class="unit">g</span>
    </div>
  </div>`;
  return `<div class="card form">
    <div class="field"><label>Servings</label>
      <div class="stepper"><button data-act="qty-step" data-d="-0.5">−</button><input data-k="qty" type="number" inputmode="decimal" step="0.25" min="0" value="${r1(state.qty)}"><button data-act="qty-step" data-d="0.5">+</button></div>
    </div>
  </div>`;
}
const per100Line = (f) => (f.grams ? `<div class="per100 num">Per 100 g: ${fmt(per100(f, 'kcal'))} kcal · P ${r1(per100(f, 'protein'))} · C ${r1(per100(f, 'carbs'))} · F ${r1(per100(f, 'fat'))}</div>` : '');
const focusGrams = (sh) => { const g = sh.querySelector('[data-k="grams"]'); if (g) { g.focus(); g.select(); } };

function previewHtml(v, qty) {
  return `<div class="preview">
    <div><b class="num" style="color:var(--kcal)">${fmt(v.kcal * qty)}</b><span>kcal</span></div>
    <div><b class="num" style="color:var(--protein)">${fmt(v.protein * qty)}</b><span>protein</span></div>
    <div><b class="num" style="color:var(--carbs)">${fmt(v.carbs * qty)}</b><span>carbs</span></div>
    <div><b class="num" style="color:var(--fat)">${fmt(v.fat * qty)}</b><span>fat</span></div>
  </div>`;
}

const amt = { qty: 1 };
function openFoodAmount(food, grams) {
  amt.food = food;
  amt.qty = food.grams ? (grams || lastGrams(food)) / food.grams : 1;
  let first = true;
  openSheet(() => ({
    title: food.name,
    body: `<div data-preview>${previewHtml(food, amt.qty)}</div>${per100Line(food)}${amountFields(amt, food.grams)}
      ${food.db ? '<div class="form-note">From the built-in food database. It will also be saved to your foods.</div>' : ''}
      <div style="height:16px"></div><button class="btn" data-act="amount-add">Add to ${esc(addState.slot)}</button>`,
    after: (sh) => {
      const upd = () => { $('#sheet [data-preview]').innerHTML = previewHtml(food, amt.qty); };
      upd.unitGrams = food.grams;
      bindAmountInputs(upd);
      if (first) { first = false; focusGrams(sh); }
    }
  }));
}

function bindAmountInputs(onChange) {
  const sh = $('#sheet');
  const q = sh.querySelector('[data-k="qty"]');
  const g = sh.querySelector('[data-k="grams"]');
  const unit = onChange.unitGrams;
  if (q) q.oninput = () => { amt.qty = num(q.value); onChange(); };
  if (g) g.oninput = () => { amt.qty = unit ? num(g.value) / unit : amt.qty; onChange(); };
}

// ----- one logged item: edit / move / delete -----

function openItem(id) {
  const l = st().log.find((x) => x.id === id);
  if (!l) return;
  const unit = { kcal: l.kcal / l.qty, protein: l.protein / l.qty, carbs: l.carbs / l.qty, fat: l.fat / l.qty, grams: l.grams / l.qty };
  amt.qty = l.qty;
  amt.slot = l.slot;
  amt.unit = unit;
  openSheet(() => ({
    title: l.name,
    body: `<div data-preview>${previewHtml(unit, amt.qty)}</div>${amountFields(amt, unit.grams)}
      <div class="section-label">Meal</div><div class="chips">${slots().map((s) => `<button class="chip ${s === amt.slot ? 'on' : ''}" data-act="item-slot" data-slot="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      <div style="height:12px"></div>
      <button class="btn" data-act="item-save" data-id="${esc(l.id)}">Save</button>
      <button class="btn danger" data-act="item-del" data-id="${esc(l.id)}">Remove from today</button>`,
    after: () => {
      const upd = () => { $('#sheet [data-preview]').innerHTML = previewHtml(unit, amt.qty); };
      upd.unitGrams = unit.grams;
      bindAmountInputs(upd);
    }
  }));
}

// ----- food create / edit (also used for one-off entries) -----

function openFoodForm(food, mode) {
  const f = Object.assign({ name: '', kcal: '', protein: '', carbs: '', fat: '', grams: 100 }, food || {});
  const custom = mode === 'custom';
  const fields = [['grams', 'Values are for', 'g'], ['kcal', 'Calories', 'kcal'], ['protein', 'Protein', 'g'], ['carbs', 'Carbs', 'g'], ['fat', 'Fat', 'g']];
  openSheet(() => ({
    title: custom ? 'New entry' : food && food.id ? 'Edit food' : 'New food',
    body: `<div class="card form">
        <div class="field"><input class="wide" data-k="name" placeholder="Food name, e.g. striploin" value="${esc(f.name)}" autocomplete="off"></div>
        ${fields.map(([k, l, u]) => `<div class="field"><label>${l}</label><input data-k="${k}" type="number" inputmode="decimal" placeholder="0" value="${f[k] === '' ? '' : r1(num(f[k]))}"><span class="unit">${u}</span></div>`).join('')}
      </div>
      <div class="form-note">Use the label's numbers for 100 g (or any weight). When you log it, you just type how many grams you ate. Leave “Values are for” at 0 for a whole dish you count per serving.</div>
      <div data-lookup>${lookupHtml(f.name)}</div>
      ${custom ? `<div style="height:12px"></div><div class="card form"><div class="field"><label>Save to my foods</label><span class="toggle"><input type="checkbox" data-k="keep" checked><span></span></span></div></div>` : ''}
      <div style="height:16px"></div>
      <button class="btn" data-act="food-save" data-id="${esc(f.id || '')}" data-mode="${mode || ''}">${custom ? 'Next: weight' : 'Save'}</button>
      ${food && food.id ? `<button class="btn danger" data-act="food-del" data-id="${esc(food.id)}">Delete food</button>` : ''}`,
    after: (sh) => { if (!f.name) setTimeout(() => sh.querySelector('[data-k="name"]').focus(), 350); }
  }));
}

// database suggestions under the name field
function lookupHtml(name) {
  const hits = dbSearch(name).slice(0, 4);
  if (!hits.length) return '';
  return `<div class="section-label">Fill in from the food database</div><div class="card list">${hits.map((i) => {
    const f = dbFood(i);
    return `<button class="row" data-act="db-fill" data-i="${i}">
      <div class="name"><div class="title">${esc(f.name)}</div><div class="sub num">per 100 g · P ${r1(f.protein)} · C ${r1(f.carbs)} · F ${r1(f.fat)}</div></div>
      <div class="right num">${fmt(f.kcal)}<small>kcal</small></div>
    </button>`;
  }).join('')}</div>`;
}

function readFoodForm() {
  const sh = $('#sheet');
  const v = (k) => sh.querySelector(`[data-k="${k}"]`);
  return {
    name: v('name').value.trim(), kcal: num(v('kcal').value), protein: num(v('protein').value),
    carbs: num(v('carbs').value), fat: num(v('fat').value), grams: num(v('grams').value),
    keep: v('keep') ? v('keep').checked : true
  };
}

// ----- meal (combo) create / edit -----

let draft = null;
function openMealEdit(meal) {
  draft = meal ? { id: meal.id, name: meal.name, slot: meal.slot, items: meal.items.map((i) => Object.assign({}, i)), isNew: false }
    : { id: uid('m'), name: '', slot: slots()[0], items: [], isNew: true };
  openSheet(sheetMeal, { tall: true });
}

function sheetMeal() {
  const d = draft;
  const t = mealTotals(d);
  const rows = d.items.map((i, idx) => {
    const f = foodById(i.foodId);
    if (!f) return '';
    const u = f.grams || 0; // weighed foods are edited in grams
    const step = u ? 10 / u : 1;
    return `<div class="row">
      <div class="name"><div class="title">${esc(f.name)}</div><div class="sub num">${fmt(f.kcal * i.qty)} kcal · ${fmt(f.protein * i.qty)} g P</div></div>
      <div class="stepper"><button data-act="mi-step" data-i="${idx}" data-d="${-step}">−</button><input data-k="mi-${idx}" data-act-input="mi-qty" data-i="${idx}" data-unit="${u}" type="number" inputmode="decimal" value="${r1(u ? i.qty * u : i.qty)}"><button data-act="mi-step" data-i="${idx}" data-d="${step}">+</button></div>
      ${u ? '<span class="unit" style="color:var(--muted);font-size:14px">g</span>' : ''}
    </div>`;
  }).join('');
  return {
    title: d.isNew ? 'New meal' : 'Edit meal',
    body: `<div class="card form"><div class="field"><input class="wide" data-k="meal-name" placeholder="Meal name, e.g. Usual lunch" value="${esc(d.name)}" autocomplete="off"></div></div>
      <div class="section-label">Usually eaten at</div>
      <div class="chips">${slots().map((s) => `<button class="chip ${s === d.slot ? 'on' : ''}" data-act="meal-slot" data-slot="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      ${previewHtml(t, 1)}
      <div class="card list">${rows}
        <button class="row" data-act="meal-pick"><div class="name"><div class="title" style="color:var(--accent)">Add a food</div></div></button>
      </div>
      <div style="height:16px"></div>
      <button class="btn" data-act="meal-save">Save meal</button>
      ${d.isNew ? '' : `<button class="btn secondary" data-act="meal-log">Log it now</button><button class="btn danger" data-act="meal-del">Delete meal</button>`}`
  };
}

let pickQuery = '';
function sheetPick() {
  const u = usage();
  const list = st().foods.filter((f) => matches(f.name, pickQuery)).sort((a, b) => (u[b.id] || 0) - (u[a.id] || 0) || a.name.localeCompare(b.name));
  return {
    title: 'Add a food',
    body: searchBox(pickQuery, 'Search foods') + `<div class="card list">${list.slice(0, 120).map((f) => `
      <button class="row" data-act="pick" data-id="${esc(f.id)}">
        <div class="name"><div class="title">${esc(f.name)}</div><div class="sub num">${foodSub(f)}</div></div>
        <div class="right num">${fmt(f.kcal)}<small>kcal</small></div>
      </button>`).join('')}</div>`
  };
}

// ----- slot menu, past day, end of day, settings -----

function openSlotMenu(slot) {
  openSheet(() => ({
    title: slot,
    body: `<button class="btn secondary" data-act="slot-save" data-slot="${esc(slot)}">Save as a meal</button>
      <button class="btn danger" data-act="slot-clear" data-slot="${esc(slot)}">Clear ${esc(slot)}</button>`
  }));
}

function openPastDay(date) {
  openSheet(() => {
    const items = dayItems(date);
    const t = dayTotalsFor(date);
    const note = (st().days.find((d) => d.date === date) || {}).note;
    let body = previewHtml(t, 1);
    if (note) body += `<div class="hint" style="padding:0 0 12px">Imported from your old sheet (${esc(note)}).</div>`;
    slots().concat(['']).forEach((slot) => {
      const list = items.filter((l) => (slot ? l.slot === slot : !slots().includes(l.slot)));
      if (!list.length) return;
      body += `<div class="section-label">${esc(slot || 'Other')}</div><div class="card list">${list.map((l) => `
        <div class="row"><div class="name"><div class="title">${esc(l.name)}${l.qty !== 1 ? `<span class="qty">×${r1(l.qty)}</span>` : ''}</div><div class="sub num">P ${fmt(l.protein)} · C ${fmt(l.carbs)} · F ${fmt(l.fat)}</div></div><div class="right num">${fmt(l.kcal)}</div></div>`).join('')}
        <button class="row" data-act="copy-slot" data-date="${date}" data-slot="${esc(slot)}"><div class="name"><div class="title" style="color:var(--accent)">Copy to today's ${esc(slot || 'log')}</div></div></button>
      </div>`;
    });
    if (!items.length) body += '<div class="hint">Only the totals were kept for this day.</div>';
    else body += `<div style="height:16px"></div><button class="btn" data-act="copy-day" data-date="${date}">Copy whole day into today</button>`;
    return { title: dayName(date, true), body };
  }, { tall: true });
}

function openEndDay() {
  const day = openDay();
  const next = nextDay();
  const t = totals(dayItems(day));
  openSheet(() => ({
    title: 'End ' + dayName(day) + '?',
    body: `<p style="margin:4px 4px 16px;color:var(--muted)">You've logged <b class="num" style="color:var(--text)">${fmt(t.kcal)} kcal</b> and <b class="num" style="color:var(--text)">${fmt(t.protein)} g protein</b>. After this, a fresh log starts for <b style="color:var(--text)">${esc(dayName(next, true))}</b>. This day stays in History.</p>
      <button class="btn" data-act="end-confirm">End day</button>
      <button class="btn secondary" data-act="sheet-close">Keep logging</button>`
  }));
}

function nextDay() {
  const cand = addDays(openDay(), 1);
  const today = logicalToday();
  return today > cand ? today : cand;
}

function endDaySummary(day, t, next) {
  const s = set();
  const inRange = t.kcal >= s.kcalLow && t.kcal <= s.kcalHigh;
  const diff = t.kcal - s.kcalTarget;
  const lines = [
    ['Calories', `${fmt(t.kcal)} of ${fmt(s.kcalLow)}–${fmt(s.kcalHigh)}`, inRange],
    ['Protein', `${fmt(t.protein)} of ${fmt(s.proteinTarget)} g`, t.protein >= s.proteinTarget],
    ['Carbs', `${fmt(t.carbs)} of ${fmt(s.carbsTarget)} g`, t.carbs <= s.carbsTarget * 1.1],
    ['Fat', `${fmt(t.fat)} of ${fmt(s.fatTarget)} g`, t.fat <= s.fatTarget * 1.15]
  ];
  let verdict;
  if (inRange && t.protein >= s.proteinTarget) verdict = 'Calories in range and protein hit. Good day.';
  else if (inRange) verdict = `Calories in range, but protein was ${fmt(s.proteinTarget - t.protein)} g short.`;
  else if (diff > 0) verdict = `${fmt(diff)} kcal over your ${fmt(s.kcalTarget)} target.`;
  else verdict = `${fmt(-diff)} kcal under your ${fmt(s.kcalTarget)} target.`;
  openSheet(() => ({
    title: dayName(day, true),
    action: '<span></span>',
    body: `<div class="verdict"><div class="big num" style="color:${kcalColor(t.kcal)}">${fmt(t.kcal)}<small> kcal</small></div><p>${esc(verdict)}</p></div>
      <div class="card">${lines.map(([l, v, ok]) => `<div class="check"><span class="mark" style="background:${ok ? 'var(--good)' : 'var(--warn)'}">${ok ? '✓' : '!'}</span><span class="label">${l}</span><span class="val">${v}</span></div>`).join('')}</div>
      <div style="height:18px"></div>
      <button class="btn" data-act="sheet-close">Start ${esc(dayName(next))}</button>`
  }));
}

function openSettings() {
  const s = set();
  const fields = [['kcalTarget', 'Calorie target', 'kcal'], ['kcalLow', 'Range low', 'kcal'], ['kcalHigh', 'Range high', 'kcal'], ['proteinTarget', 'Protein', 'g'], ['carbsTarget', 'Carbs', 'g'], ['fatTarget', 'Fat', 'g']];
  const last = S.lastSync ? new Date(S.lastSync).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never';
  openSheet(() => ({
    title: 'Targets & sync',
    body: `<div class="section-label">Daily targets</div><div class="card form">
        ${fields.map(([k, l, u]) => `<div class="field"><label>${l}</label><input data-k="${k}" type="number" inputmode="decimal" value="${r1(s[k])}"><span class="unit">${u}</span></div>`).join('')}
      </div>
      <div style="height:12px"></div><button class="btn" data-act="settings-save">Save targets</button>
      <div class="section-label">Google Sheet</div>
      <div class="card form">
        <div class="field"><label>Status</label><span class="unit" style="width:auto">${S.cfg ? (S.queue.length ? `${S.queue.length} waiting` : 'Connected') : 'Not connected'}</span></div>
        <div class="field"><label>Last synced</label><span class="unit" style="width:auto">${esc(last)}</span></div>
      </div>
      <div style="height:12px"></div>
      ${S.cfg ? '<button class="btn secondary" data-act="sync-now">Sync now</button>' : ''}
      ${s.sheetUrl ? `<a class="btn secondary" style="text-decoration:none" href="${esc(s.sheetUrl)}" target="_blank" rel="noopener">Open the Google Sheet</a>` : ''}`
  }));
}

// ---------- toast ----------

let toastTimer = null;
function toast(msg, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button data-act="undo">Undo</button>' : ''}`;
  el._undo = undo;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), undo ? 4000 : 2200);
}

// ---------- events ----------

document.addEventListener('click', (e) => {
  const tabBtn = e.target.closest('#tabs button');
  if (tabBtn) { tab = tabBtn.dataset.tab; foodSel = null; window.scrollTo(0, 0); render(); return; }
  if (e.target.id === 'scrim') { closeSheets(); return; }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act, id = el.dataset.id, slot = el.dataset.slot, date = el.dataset.date;
  e.stopPropagation();
  switch (act) {
    case 'sheet-close': closeSheets(); break;
    case 'sheet-back': popSheet(); break;
    case 'undo': { const t = $('#toast'); if (t._undo) t._undo(); t.classList.remove('on'); t._undo = null; if (sheetOpen()) redrawSheet(); break; }

    case 'add': openAdd(slot); break;
    case 'add-slot': addState.slot = slot; addState.justAdded = {}; redrawSheet(); break;
    case 'add-mode': addState.mode = el.dataset.mode; addState.q = ''; redrawSheet(false); break;
    case 'add-food': {
      const f = foodById(id);
      const rows = addFoodNow(f, usualQty(f), addState.slot);
      addState.justAdded[id] = 1;
      redrawSheet();
      undoRows(rows, `Added ${f.name}`);
      break;
    }
    case 'add-meal': {
      const m = st().meals.find((x) => x.id === id);
      const rows = addMealNow(m, addState.slot);
      addState.justAdded[id] = 1;
      redrawSheet();
      undoRows(rows, `Added ${rows.length} items to ${addState.slot}`);
      break;
    }
    case 'add-past': {
      const rows = copyItems(dayItems(date).filter((l) => l.slot === slot), addState.slot);
      addState.justAdded[date + '|' + slot] = 1;
      redrawSheet();
      undoRows(rows, `Added ${rows.length} items to ${addState.slot}`);
      break;
    }
    case 'copy-day': {
      const rows = copyItems(dayItems(date));
      closeSheets();
      tab = 'today';
      render();
      undoRows(rows, `Copied ${rows.length} items from ${dayName(date)}`);
      break;
    }
    case 'copy-slot': {
      const rows = copyItems(dayItems(date).filter((l) => (slot ? l.slot === slot : !slots().includes(l.slot))));
      undoRows(rows, `Copied ${rows.length} items to today`);
      break;
    }
    case 'food-amount': openFoodAmount(foodById(id)); break;
    case 'qty-step': {
      const q = $('#sheet [data-k="qty"]');
      q.value = Math.max(0.25, r1(amt.qty + num(el.dataset.d)));
      q.dispatchEvent(new Event('input'));
      break;
    }
    case 'g-step': {
      const g = $('#sheet [data-k="grams"]');
      g.value = Math.max(0, r1(num(g.value) + num(el.dataset.d)));
      g.dispatchEvent(new Event('input'));
      break;
    }
    case 'amount-add': {
      if (amt.qty <= 0) break;
      let food = amt.food;
      if (food.db) {
        // a database food becomes one of your foods the first time you log it
        food = st().foods.find((x) => x.name.toLowerCase() === food.name.toLowerCase()) || saveDbFood(food);
      }
      const rows = addFoodNow(food, amt.qty, addState.slot);
      if (food.id) addState.justAdded[food.id] = 1;
      popSheet();
      undoRows(rows, `Added ${food.name}`);
      break;
    }
    case 'custom': openFoodForm({ name: addState.q }, 'custom'); break;
    case 'db-amount': openFoodAmount(dbFood(Number(el.dataset.i)), parseGrams(addState.q)); break;
    case 'db-save': { const f = dbFood(Number(el.dataset.i)); openFoodForm({ name: f.name, kcal: f.kcal, protein: f.protein, carbs: f.carbs, fat: f.fat, grams: 100 }, 'new'); break; }
    case 'db-fill': {
      const f = dbFood(Number(el.dataset.i));
      const sh = $('#sheet');
      const put = (k, v) => { sh.querySelector(`[data-k="${k}"]`).value = v; };
      if (!sh.querySelector('[data-k="name"]').value.trim()) put('name', f.name);
      put('grams', 100); put('kcal', f.kcal); put('protein', f.protein); put('carbs', f.carbs); put('fat', f.fat);
      sh.querySelector('[data-lookup]').innerHTML = '';
      toast('Filled in per 100 g');
      break;
    }

    case 'sel-start': foodSel = new Set(); render(); break;
    case 'sel-cancel': foodSel = null; render(); break;
    case 'sel-toggle': if (foodSel.has(id)) foodSel.delete(id); else foodSel.add(id); render(); break;
    case 'sel-delete': {
      const ids = foodSel;
      const gone = st().foods.filter((f) => ids.has(f.id));
      const touched = st().meals.filter((m) => m.items.some((i) => ids.has(i.foodId))).map((m) => Object.assign({}, m, { items: m.items.slice() }));
      const ops = gone.map((f) => ({ type: 'food.del', data: { id: f.id } }));
      touched.forEach((m) => {
        const items = m.items.filter((i) => !ids.has(i.foodId));
        ops.push(items.length ? { type: 'meal.put', data: Object.assign({}, m, { items }) } : { type: 'meal.del', data: { id: m.id } });
      });
      foodSel = null;
      commit(ops);
      toast(`Deleted ${gone.length} food${gone.length > 1 ? 's' : ''}${touched.length ? ` (also taken out of ${touched.length} meal${touched.length > 1 ? 's' : ''})` : ''}`,
        () => commit(gone.map((f) => ({ type: 'food.put', data: f })).concat(touched.map((m) => ({ type: 'meal.put', data: m })))));
      break;
    }

    case 'item': openItem(id); break;
    case 'item-slot': amt.slot = slot; el.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === el)); break;
    case 'item-save': {
      const l = st().log.find((x) => x.id === id);
      if (!l || amt.qty <= 0) break;
      const u = amt.unit;
      commit({ type: 'log.put', data: Object.assign({}, l, { qty: amt.qty, slot: amt.slot, kcal: r1(u.kcal * amt.qty), protein: r1(u.protein * amt.qty), carbs: r1(u.carbs * amt.qty), fat: r1(u.fat * amt.qty), grams: r1(u.grams * amt.qty) }) });
      closeSheets();
      break;
    }
    case 'item-del': {
      const l = st().log.find((x) => x.id === id);
      commit({ type: 'log.del', data: { id } });
      closeSheets();
      toast(`Removed ${l.name}`, () => commit({ type: 'log.put', data: l }));
      break;
    }

    case 'slot-menu': openSlotMenu(slot); break;
    case 'slot-clear': {
      const rows = dayItems(openDay()).filter((l) => l.slot === slot);
      commit(rows.map((r) => ({ type: 'log.del', data: { id: r.id } })));
      closeSheets();
      toast(`Cleared ${slot}`, () => commit(rows.map((r) => ({ type: 'log.put', data: r }))));
      break;
    }
    case 'slot-save': {
      const rows = dayItems(openDay()).filter((l) => l.slot === slot);
      const ops = [];
      const items = [];
      rows.forEach((l) => {
        let fid = l.foodId && foodById(l.foodId) ? l.foodId : '';
        let qty = l.qty;
        if (!fid) {
          const f = { id: uid('f'), name: l.name, kcal: r1(l.kcal / l.qty), protein: r1(l.protein / l.qty), carbs: r1(l.carbs / l.qty), fat: r1(l.fat / l.qty), grams: r1(l.grams / l.qty), uses: 0 };
          ops.push({ type: 'food.put', data: f });
          fid = f.id;
        }
        const ex = items.find((i) => i.foodId === fid);
        if (ex) ex.qty += qty; else items.push({ foodId: fid, qty });
      });
      if (ops.length) commit(ops);
      sheetStack.length = 0;
      draft = { id: uid('m'), name: summariseItems(rows), slot, items, isNew: true };
      openSheet(sheetMeal, { tall: true });
      break;
    }

    case 'food-new': openFoodForm(null, 'new'); break;
    case 'food-edit': openFoodForm(foodById(id), 'edit'); break;
    case 'food-save': {
      const v = readFoodForm();
      if (!v.name) { toast('Give it a name first'); break; }
      const mode = el.dataset.mode;
      // "Striploin 200g" is saved as "Striploin": the weight is asked for when logging
      const name = mode === 'custom' && v.grams ? v.name.replace(/\s*\d+(\.\d+)?\s*(g|gm|grams?)\b/i, '').trim() || v.name : v.name;
      const food = { id: id || uid('f'), name, kcal: v.kcal, protein: v.protein, carbs: v.carbs, fat: v.fat, grams: v.grams, uses: 0 };
      if (mode === 'custom') {
        if (v.keep) commit({ type: 'food.put', data: food });
        popSheet();
        // next step: how much you ate
        openFoodAmount(v.keep ? food : Object.assign({}, food, { id: '' }), parseGrams(v.name) || food.grams);
      } else {
        commit({ type: 'food.put', data: food });
        popSheet();
        toast('Saved');
      }
      break;
    }
    case 'food-del': {
      const f = foodById(id);
      commit({ type: 'food.del', data: { id } });
      popSheet();
      toast(`Deleted ${f.name}`, () => commit({ type: 'food.put', data: f }));
      break;
    }

    case 'meal-new': openMealEdit(null); break;
    case 'meal-edit': if (e.target.closest('.add-dot')) break; openMealEdit(st().meals.find((m) => m.id === id)); break;
    case 'meal-slot': draft.slot = slot; redrawSheet(); break;
    case 'meal-pick': pickQuery = ''; openSheet(sheetPick, { tall: true }); break;
    case 'pick': {
      const ex = draft.items.find((i) => i.foodId === id);
      const q = usualQty(foodById(id));
      if (ex) ex.qty += q; else draft.items.push({ foodId: id, qty: q });
      popSheet();
      break;
    }
    case 'mi-step': {
      const i = Number(el.dataset.i);
      draft.items[i].qty = Math.round((draft.items[i].qty + num(el.dataset.d)) * 1e4) / 1e4;
      if (draft.items[i].qty <= 1e-6) draft.items.splice(i, 1);
      redrawSheet();
      break;
    }
    case 'meal-save': {
      const name = (draft.name || '').trim();
      if (!draft.items.length) { toast('Add at least one food'); break; }
      const meal = { id: draft.id, name: name || summariseItems(draft.items.map((i) => ({ name: (foodById(i.foodId) || {}).name, qty: i.qty }))), slot: draft.slot, items: draft.items };
      commit({ type: 'meal.put', data: meal });
      closeSheets();
      toast('Meal saved');
      break;
    }
    case 'meal-log': {
      const m = st().meals.find((x) => x.id === draft.id);
      const rows = addMealNow(m, m.slot);
      closeSheets();
      tab = 'today';
      render();
      undoRows(rows, `Added ${m.name.length > 28 ? 'meal' : m.name} to ${m.slot}`);
      break;
    }
    case 'meal-del': {
      const m = st().meals.find((x) => x.id === draft.id);
      commit({ type: 'meal.del', data: { id: m.id } });
      closeSheets();
      toast('Meal deleted', () => commit({ type: 'meal.put', data: m }));
      break;
    }

    case 'day': openPastDay(date); break;
    case 'end-day': openEndDay(); break;
    case 'end-confirm': {
      const day = openDay();
      const t = totals(dayItems(day));
      const next = nextDay();
      commit({ type: 'day.close', data: { next, summary: { date: day, kcal: r1(t.kcal), protein: r1(t.protein), carbs: r1(t.carbs), fat: r1(t.fat), closedAt: new Date().toISOString(), note: '' } } });
      sheetStack.length = 0;
      endDaySummary(day, t, next);
      break;
    }
    case 'settings': openSettings(); break;
    case 'settings-save': {
      const data = {};
      ['kcalTarget', 'kcalLow', 'kcalHigh', 'proteinTarget', 'carbsTarget', 'fatTarget'].forEach((k) => { data[k] = num($(`#sheet [data-k="${k}"]`).value); });
      commit({ type: 'settings.put', data });
      closeSheets();
      toast('Targets saved');
      break;
    }
    case 'sync-now': pull().then(() => { toast(S.syncErr || 'Up to date'); if (sheetOpen()) redrawSheet(); }); break;
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.hasAttribute('data-search')) {
    if (t.closest('#sheet')) {
      if (sheetStack[sheetStack.length - 1].fn === sheetPick) pickQuery = t.value; else addState.q = t.value;
      redrawSheet(false);
    } else { foodsQuery = t.value; render(); }
    return;
  }
  if (t.dataset.k === 'meal-name') draft.name = t.value;
  if (t.dataset.actInput === 'mi-qty') {
    const i = Number(t.dataset.i);
    const u = num(t.dataset.unit);
    draft.items[i].qty = u ? num(t.value) / u : num(t.value);
  }
  // food form: database suggestions follow the name
  if (t.closest('#sheet') && t.dataset.k === 'name' && $('#sheet [data-lookup]')) $('#sheet [data-lookup]').innerHTML = lookupHtml(t.value);
});

document.addEventListener('change', (e) => {
  if (e.target.dataset.actInput === 'mi-qty') {
    const i = Number(e.target.dataset.i);
    if (draft.items[i].qty <= 0) draft.items.splice(i, 1);
    redrawSheet();
  }
});

// ---------- start ----------

render();
pull();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); })).catch(() => {});
