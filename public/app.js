(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  function h(tag, attrs) {
    const el = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (let i = 2; i < arguments.length; i++) {
      const kid = arguments[i];
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(kid));
    }
    return el;
  }
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };
  const OFFLINE = 'Could not reach the server. Check your connection and try again.';
  async function call(method, url, body) {
    let res;
    try {
      res = await fetch(url, { method, credentials: 'same-origin',
        headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    } catch (e) { return { status: 0, data: { error: OFFLINE } }; }
    const data = await res.json().catch(() => ({ error: 'Unexpected response from the server.' }));
    return { status: res.status, data };
  }
  // The preview build swaps this object for one that runs the engine in the browser.
  const api = window.DunwellAPI || {
    config: () => call('GET', '/api/config'),
    chase: (b) => call('POST', '/api/chase', b),
    tailor: (b) => call('POST', '/api/tailor', b),
    unlock: (b) => call('POST', '/api/unlock', b),
    restore: (b) => call('POST', '/api/restore', b),
    portal: () => call('POST', '/api/portal', {})
  };

  let cfg = { pro: false, billing: false, ai: false };
  let lastIcs = null;
  const form = $('#tool');
  const isoLocal = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const localToday = () => isoLocal(new Date());
  const niceDate = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const money = (v, cur) => { try { return new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur }).format(v); } catch (e) { return v.toFixed(2) + ' ' + cur; } };

  function banner(msg, kind) {
    const b = $('#banner');
    b.textContent = msg; b.className = 'wrap banner ' + (kind || ''); b.hidden = !msg;
  }

  // ---------- form ----------
  const HINTS = {
    uk: 'Statutory interest at 8% above the Bank of England base rate, plus £40 to £100 fixed compensation.',
    eu: 'Statutory interest at the ECB reference rate plus 8 points, plus €40 compensation.',
    contract: 'Uses the late-payment terms written in your contract or on your invoice.',
    none: 'Writes the emails without mentioning interest or fees.'
  };
  const SYMBOL = { uk: '£', eu: '€' };
  function regime() { return (form.elements.regime.value) || 'uk'; }
  function syncRegime() {
    const r = regime();
    $('#regime-hint').textContent = HINTS[r];
    $$('[data-show]', form).forEach((el) => { el.hidden = el.getAttribute('data-show') !== r; });
    const fixed = r === 'uk' || r === 'eu';
    $('#cur-fixed').hidden = !fixed; $('#cur-fixed').textContent = SYMBOL[r] || '';
    $('#currency').hidden = fixed;
  }
  const FIELDS = ['amount', 'currency', 'dueDate', 'margin', 'contractRate', 'ratePer', 'lateFee', 'invoiceNumber', 'clientCompany',
    'clientContact', 'yourName', 'yourBusiness', 'invoiceDate', 'yourAddress', 'clientAddress', 'paymentDetails'];
  function readForm() {
    const o = { today: localToday() };
    ['regime', 'tone'].forEach((n) => { o[n] = form.elements[n].value; });
    FIELDS.forEach((n) => { o[n] = form.elements[n].value; });
    return o;
  }
  function fillForm(o) {
    for (const k in o) {
      const el = form.elements[k];
      if (!el || o[k] == null) continue;
      el.value = o[k];
    }
    syncRegime();
  }
  const MINE = ['yourName', 'yourBusiness', 'yourAddress', 'paymentDetails', 'tone', 'regime', 'currency', 'ratePer'];
  function showErrors(errors) {
    $$('[data-err]', form).forEach((el) => { el.textContent = errors[el.getAttribute('data-err')] || ''; });
    $$('input,textarea,select', form).forEach((el) => el.toggleAttribute('aria-invalid', !!errors[el.name]));
    const first = Object.keys(errors)[0];
    if (first && form.elements[first] && form.elements[first].focus) form.elements[first].focus();
  }

  async function submit(ev, opts) {
    if (ev) ev.preventDefault();
    opts = opts || {};
    const btn = $('#submit'), raw = readForm();
    $('#form-err').textContent = ''; showErrors({});
    btn.disabled = true; btn.textContent = 'Working it out…';
    const { status, data } = await api.chase(raw);
    btn.disabled = false; btn.textContent = 'Calculate and write my chase';
    if (status === 422 && data.errors) return showErrors(data.errors);
    if (status !== 200 || !data.ok) { $('#form-err').textContent = data.error || 'Something went wrong. Please try again.'; return; }
    if (!opts.example) { const mine = {}; MINE.forEach((k) => { mine[k] = raw[k]; }); store.set('dw.mine', mine); }
    cfg.pro = data.pro;
    const tracked = opts.example ? false : saveChase(raw, data);
    render(raw, data, tracked ? chaseId(raw) : null);
    if (opts.example) banner('This is an example invoice. Replace the details with your own to save it to your tracker.', 'ok');
    $('#results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function example() {
    const due = new Date(); due.setDate(due.getDate() - 24);
    const issued = new Date(due); issued.setDate(issued.getDate() - 30);
    form.reset();
    fillForm({ regime: 'uk', tone: 'warm', amount: '2,400.00', dueDate: isoLocal(due), invoiceDate: isoLocal(issued), invoiceNumber: 'INV-0142',
      clientCompany: 'Northgate Studio Ltd', clientContact: 'Sam', yourName: 'Jo Smith', yourBusiness: 'Smith Design Ltd' });
    submit(null, { example: true });
  }

  // ---------- results ----------
  function render(raw, data, trackedId) {
    const s = data.summary, f = s.fmt;
    const ledger = $('#ledger'); ledger.replaceChildren();
    const overdue = s.days > 0;
    ledger.append(
      h('p', { class: 'eyebrow', text: `Invoice ${raw.invoiceNumber.trim()} · due ${s.dueLabel}` }),
      h('h2', { class: 'ledger-head' }, overdue ? `${raw.clientCompany.trim()} owes you ` : 'Not overdue yet: ',
        h('span', { class: 'figure', text: f.total })),
      h('p', { class: 'ledger-sub', text: overdue
        ? `${s.days} day${s.days === 1 ? '' : 's'} overdue as of ${s.asOfLabel}.` + (s.regime !== 'none' && s.rate > 0 ? ` Growing by ${f.daily} a day.` : '')
        : 'Nothing is owed beyond the invoice yet. The schedule below shows what to send, and when, if it goes unpaid.' })
    );
    const rows = h('dl', { class: 'ledger-rows' });
    const row = (k, v, cls) => rows.append(h('div', { class: cls || '' }, h('dt', { text: k }), h('dd', { text: v })));
    row('Invoice amount', f.amount);
    if (s.regime !== 'none') {
      row(`Interest at ${f.rate} a year`, f.interest);
      if (s.regime !== 'contract' || s.compensation > 0) row(s.regime === 'contract' ? 'Late fee' : 'Fixed compensation', f.compensation);
      row('Total you can claim', f.total, 'total');
    }
    ledger.append(rows);
    if (s.segments.length) {
      const t = h('table', { class: 'seg-table' },
        h('thead', null, h('tr', null, h('th', { text: 'Period' }), h('th', { text: 'Days' }), h('th', { text: 'Rate' }), h('th', { text: 'Interest' }))));
      const tb = h('tbody');
      s.segments.forEach((g) => tb.append(h('tr', null, h('td', { text: g.label + (g.provisional ? ' *' : '') }),
        h('td', { text: String(g.days) }), h('td', { text: g.rate }), h('td', { text: g.interest }))));
      t.append(tb);
      ledger.append(h('details', { class: 'calc' }, h('summary', { text: 'How the interest is calculated' }),
        h('p', { class: 'fine', text: 'Simple interest on the amount owed: amount × annual rate × days ÷ 365, from the day after the due date.' }), t,
        s.provisional ? h('p', { class: 'fine', text: '* The reference rate for this half-year has not been published in Dunwell yet, so the previous rate is used.' }) : null));
    }
    if (s.regime === 'uk' || s.regime === 'eu')
      ledger.append(h('p', { class: 'fine', text: 'Statutory interest applies to business-to-business debts. If your contract sets its own late-payment rate, use "Contract rate" instead.' }));

    lastIcs = data.ics;
    $('#ics-btn').hidden = !data.ics || !!cfg.preview;
    const list = $('#steps'); list.replaceChildren();
    const openId = (data.steps.find((x) => x.status === 'now') || data.steps.find((x) => x.status === 'upcoming') || data.steps[0]).id;
    data.steps.forEach((st) => list.append(renderStep(st, st.id === openId, trackedId)));
    const extras = $('#extras'); extras.replaceChildren();
    (data.extras || []).forEach((st) => extras.append(renderStep(st, false, null)));
    $('#extras-wrap').hidden = !(data.extras || []).length;
    $('#results').hidden = false;
  }

  function renderStep(st, open, trackedId) {
    const inSequence = !!st.status;
    const when = !inSequence ? null : st.status === 'now' ? 'Send today' : st.status === 'upcoming' ? `Send on ${st.sendOnLabel}` : 'Earlier step';
    const li = h('li', { class: `step step-${st.status || 'extra'}${st.locked ? ' step-locked' : ''}` });
    const det = h('details', { open: open });
    const sentChip = h('span', { class: 'chip chip-sent', hidden: true });
    det.append(h('summary', null,
      inSequence ? h('span', { class: 'step-day', text: `Day ${st.day}` }) : null,
      h('span', { class: 'step-title', text: inSequence ? `${st.n}. ${st.title}` : st.title }),
      sentChip,
      when ? h('span', { class: `chip chip-${st.status}`, text: when }) : null,
      st.locked ? h('span', { class: 'chip chip-pro', text: 'Pro' }) : null));
    const box = h('div', { class: 'step-body' });
    if (st.when) box.append(h('p', { class: 'fine when', text: st.when + '.' }));
    box.append(h('p', { class: 'subject' }, h('span', { class: 'soft', text: st.kind === 'email' ? 'Subject: ' : 'Title: ' }), st.subject));
    if (st.locked) {
      box.append(h('p', { class: 'preview', text: st.preview }),
        h('div', { class: 'lock' },
          h('p', null, inSequence ? `This step is written and ready, with figures as of ${st.figuresAsOf} (${st.totalLabel}).` : 'Written for this invoice and ready to use.'),
          h('a', { class: 'btn btn-primary', href: '#pricing', text: 'Unlock with Pro' })));
    } else {
      const pre = h('pre', { class: 'msg', text: st.body });
      const original = st.body;
      const text = () => pre.innerText.replace(/\n{3,}/g, '\n\n').trim();
      const status = h('span', { class: 'fine act-status', role: 'status' });
      const flash = (t) => { status.textContent = t; setTimeout(() => { if (status.textContent === t) status.textContent = ''; }, 2500); };
      const editBtn = h('button', { class: 'btn btn-ghost', type: 'button', text: 'Edit' });
      editBtn.addEventListener('click', () => {
        const on = pre.getAttribute('contenteditable') == null;
        if (on) {
          pre.setAttribute('contenteditable', 'plaintext-only');
          if (pre.contentEditable !== 'plaintext-only') pre.setAttribute('contenteditable', 'true');
          pre.focus();
        } else pre.removeAttribute('contenteditable');
        pre.classList.toggle('editing', on);
        editBtn.textContent = on ? 'Done editing' : 'Edit';
      });
      const acts = h('div', { class: 'acts' },
        h('button', { class: 'btn btn-primary', type: 'button', text: st.kind === 'email' ? 'Copy message' : st.kind === 'letter' ? 'Copy letter' : 'Copy script',
          onclick: () => copy(text()).then((ok) => flash(ok ? 'Copied' : 'Copy failed. Select the text instead.')) }),
        st.kind === 'script' ? null : h('button', { class: 'btn btn-ghost', type: 'button', text: 'Copy subject',
          onclick: () => copy(st.subject).then((ok) => flash(ok ? 'Subject copied' : 'Copy failed.')) }),
        editBtn,
        cfg.preview ? null : st.kind === 'email'
          ? h('a', { class: 'btn btn-ghost', text: 'Open in email app',
            href: '#', onclick: function () { this.href = 'mailto:?subject=' + encodeURIComponent(st.subject) + '&body=' + encodeURIComponent(text()); } })
          : h('button', { class: 'btn btn-ghost', type: 'button', text: 'Print or save as PDF', onclick: () => printLetter(text()) }));
      box.append(pre, acts, status);
      if (inSequence && trackedId) box.append(sentUI(trackedId, st, sentChip));
      if (cfg.ai && cfg.pro && st.kind !== 'script') box.append(tailorUI(pre, original, flash));
      box.append(h('p', { class: 'note' }, h('strong', { text: 'Tip: ' }), st.note));
      if (inSequence) box.append(h('p', { class: 'fine', text: `Figures as of ${st.figuresAsOf}. Come back on the day and recalculate before sending.` }));
    }
    det.append(box); li.append(det);
    return li;
  }

  // "Mark as sent" keeps a dated record per step in the tracker.
  function sentUI(id, st, chip) {
    const wrap = h('p', { class: 'sent-line' });
    function paint() {
      const item = store.get('dw.chases', []).find((c) => c.id === id);
      const on = item && item.sent && item.sent[st.id];
      chip.hidden = !on; chip.textContent = on ? `Sent ${niceDate(on)}` : '';
      wrap.replaceChildren(on
        ? h('span', null, `Marked as sent on ${niceDate(on)}. `, h('button', { class: 'linkish', type: 'button', text: 'Undo', onclick: () => set(null) }))
        : h('button', { class: 'linkish', type: 'button', text: 'Mark this step as sent today', onclick: () => set(localToday()) }));
    }
    function set(date) {
      const list = store.get('dw.chases', []);
      const item = list.find((c) => c.id === id);
      if (!item) return;
      item.sent = item.sent || {};
      if (date) item.sent[st.id] = date; else delete item.sent[st.id];
      store.set('dw.chases', list); paint(); renderTracker();
    }
    paint();
    return wrap;
  }

  function tailorUI(pre, original, flash) {
    const ta = h('textarea', { rows: '2', maxlength: '600', 'aria-label': 'Describe the situation',
      placeholder: 'e.g. They say they are waiting on a payment from their own client. We have worked together for three years.' });
    const go = h('button', { class: 'btn btn-ghost', type: 'button', text: 'Rewrite for this situation' });
    const undo = h('button', { class: 'linkish', type: 'button', text: 'Restore original', hidden: true });
    go.addEventListener('click', async () => {
      go.disabled = true; go.textContent = 'Rewriting…';
      const { status, data } = await api.tailor({ body: original, context: ta.value });
      go.disabled = false; go.textContent = 'Rewrite for this situation';
      if (status !== 200) return flash(data.error || 'Could not rewrite. Your original is unchanged.');
      pre.textContent = data.body; undo.hidden = false; flash('Rewritten. Check the figures before sending.');
    });
    undo.addEventListener('click', () => { pre.textContent = original; undo.hidden = true; });
    return h('details', { class: 'tailor' }, h('summary', { text: 'Tailor this to the situation' }), ta, h('div', { class: 'acts' }, go, undo));
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall through */ }
    const ta = h('textarea', { class: 'offscreen' }); ta.value = text; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove(); return ok;
  }
  function printLetter(text) {
    $('#print-sheet').replaceChildren(h('pre', { text }));
    window.print();
  }
  function download(name, type, content) {
    const a = h('a', { href: URL.createObjectURL(new Blob([content], { type })), download: name });
    document.body.append(a); a.click(); a.remove();
  }

  // ---------- tracker (this browser only) ----------
  const chaseId = (raw) => (raw.clientCompany + '|' + raw.invoiceNumber).trim().toLowerCase();
  function saveChase(raw, data) {
    const list = store.get('dw.chases', []);
    const id = chaseId(raw), i = list.findIndex((c) => c.id === id);
    const item = { id, raw, client: raw.clientCompany.trim(), inv: raw.invoiceNumber.trim(), due: raw.dueDate,
      total: data.summary.fmt.total, totalNum: data.summary.total, daily: data.summary.daily || 0, currency: data.summary.currency,
      sent: i >= 0 ? (list[i].sent || {}) : {},
      schedule: data.steps.filter((s) => s.status !== 'earlier').map((s) => ({ id: s.id, title: s.title, sendOn: s.sendOn })) };
    if (i >= 0) list[i] = item;
    else if (cfg.pro || list.length === 0) list.push(item);
    else { renderTracker('Free tracks one invoice at a time. Pro tracks them all.'); return false; }
    store.set('dw.chases', list); renderTracker();
    return true;
  }
  function renderTracker(note) {
    const list = store.get('dw.chases', []), box = $('#tracker-list'), today = localToday();
    $('#tracker').hidden = list.length === 0;
    $('#tracker-note').textContent = note || 'Saved in this browser only. Download a backup if you clear your browser data or switch computer.';
    const sums = {}, daily = {};
    list.forEach((c) => { if (c.currency && c.totalNum) { sums[c.currency] = (sums[c.currency] || 0) + c.totalNum; daily[c.currency] = (daily[c.currency] || 0) + (c.daily || 0); } });
    const curs = Object.keys(sums);
    $('#tracker-sum').textContent = curs.length
      ? `${list.length} open ${list.length === 1 ? 'invoice' : 'invoices'} · ${curs.map((k) => money(sums[k], k)).join(' + ')} outstanding at last check`
        + (curs.some((k) => daily[k] > 0) ? ` · growing by ${curs.filter((k) => daily[k] > 0).map((k) => money(daily[k], k)).join(' + ')} a day` : '')
      : '';
    box.replaceChildren();
    list.forEach((c) => {
      const days = Math.round((Date.parse(today) - Date.parse(c.due)) / 86400000);
      const pending = c.schedule.filter((s) => !(c.sent && c.sent[s.id]));
      const next = pending.find((s) => s.sendOn >= today) || pending[0] || null;
      const dueNow = next && next.sendOn <= today;
      const sentIds = Object.keys(c.sent || {});
      const lastSent = sentIds.sort((a, b) => (c.sent[a] < c.sent[b] ? 1 : -1))[0];
      box.append(h('div', { class: 'track-row' },
        h('div', { class: 'track-main' },
          h('strong', { text: c.client }), h('span', { class: 'soft', text: ` · invoice ${c.inv}` }),
          h('div', { class: 'fine', text: (days > 0 ? `${days} days overdue` : 'Not overdue yet') + ` · ${c.total} at last check`
            + (lastSent ? ` · last sent ${niceDate(c.sent[lastSent])}` : '') })),
        h('div', { class: 'track-next' },
          next ? h('span', { class: 'chip ' + (dueNow ? 'chip-now' : 'chip-upcoming'), text: dueNow ? `${next.title}: send today` : `Next: ${next.title}, ${niceDate(next.sendOn)}` })
               : h('span', { class: 'chip chip-sent', text: 'All steps sent' })),
        h('div', { class: 'acts' },
          h('button', { class: 'btn btn-ghost', type: 'button', text: 'Open', onclick: () => { fillForm(c.raw); submit(); } }),
          h('button', { class: 'btn btn-ghost', type: 'button', text: 'Mark paid', onclick: () => {
            store.set('dw.chases', store.get('dw.chases', []).filter((x) => x.id !== c.id));
            renderTracker(); banner(`${c.client} marked as paid. Well chased.`, 'ok');
          } }))));
    });
  }
  function exportTracker() {
    download(`dunwell-backup-${localToday()}.json`, 'application/json',
      JSON.stringify({ app: 'dunwell', version: 1, exported: localToday(), chases: store.get('dw.chases', []), mine: store.get('dw.mine', {}) }, null, 2));
  }
  function importTracker(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try { data = JSON.parse(reader.result); } catch (e) { return renderTracker('That file is not a Dunwell backup.'); }
      const incoming = (data && data.app === 'dunwell' && Array.isArray(data.chases) ? data.chases : [])
        .filter((c) => c && typeof c.id === 'string' && c.raw && typeof c.raw === 'object' && Array.isArray(c.schedule)).slice(0, 500);
      if (!incoming.length) return renderTracker('That file has no saved invoices in it.');
      const list = store.get('dw.chases', []);
      incoming.forEach((c) => { const i = list.findIndex((x) => x.id === c.id); if (i >= 0) list[i] = c; else list.push(c); });
      const kept = cfg.pro ? list : list.slice(0, 1);
      store.set('dw.chases', kept);
      renderTracker(kept.length < list.length ? 'Free tracks one invoice at a time, so only the first was restored. Pro tracks them all.'
        : `Restored ${incoming.length} ${incoming.length === 1 ? 'invoice' : 'invoices'} from the backup.`);
    };
    reader.readAsText(file);
  }

  // ---------- plan, pricing, billing ----------
  function applyConfig() {
    const chip = $('#plan-chip');
    chip.hidden = !cfg.pro; chip.textContent = cfg.preview ? 'Preview' : cfg.dev ? 'Pro (dev unlock)' : 'Pro';
    $('#yearly-line').hidden = !cfg.yearly; $('#buy-yearly').hidden = !cfg.yearly || cfg.pro;
    $('#ai-line').hidden = !cfg.ai;
    if (cfg.pro) {
      $('#buy').replaceChildren(h('p', { class: 'on-pro', text: cfg.preview ? 'Preview build: all steps are unlocked.' : 'You are on Pro. Every step is unlocked.' }));
      $('#buy-msg').hidden = true;
    }
    $('#manage-line').hidden = !cfg.canManage;
    $('#test-mode').hidden = !(cfg.paddle && cfg.paddle.env === 'sandbox') || cfg.pro;
    if (cfg.rates) {
      $('#uk-rate').textContent = cfg.rates.uk.total; $('#uk-ref').textContent = cfg.rates.uk.ref;
      $('#eu-rate').textContent = cfg.rates.eu.total; $('#eu-ref').textContent = cfg.rates.eu.ref;
      $('#rates-verified').textContent = `Rates checked against Bank of England and ECB publications on ${cfg.rates.verified}.`;
    }
  }
  // Paddle.js is loaded only when the server says payments are configured.
  let paddleReady = null;
  function loadPaddle() {
    if (paddleReady) return paddleReady;
    paddleReady = new Promise((resolve, reject) => {
      const sc = h('script', { src: 'https://cdn.paddle.com/paddle/v2/paddle.js' });
      sc.onload = () => {
        try {
          if (cfg.paddle.env === 'sandbox') window.Paddle.Environment.set('sandbox');
          window.Paddle.Initialize({ token: cfg.paddle.token, eventCallback: onPaddleEvent });
          resolve(window.Paddle);
        } catch (e) { reject(e); }
      };
      sc.onerror = () => reject(new Error('load'));
      document.head.append(sc);
    });
    paddleReady.catch(() => { paddleReady = null; });
    return paddleReady;
  }
  async function onPaddleEvent(ev) {
    if (!ev || ev.name !== 'checkout.completed' || !ev.data || !ev.data.transaction_id) return;
    const msg = $('#buy-msg');
    msg.textContent = 'Payment received. Unlocking Pro…';
    // Paddle finishes creating the subscription a moment after payment, so ask a few times.
    for (let i = 0; i < 12; i++) {
      const { status, data } = await api.unlock({ transactionId: ev.data.transaction_id });
      if (status === 200) {
        try { window.Paddle.Checkout.close(); } catch (e) { /* already closed */ }
        window.location.href = '/?welcome=1#tool';
        return;
      }
      if (status !== 202 && status !== 0 && status !== 502) { msg.textContent = data.error || 'We could not confirm that payment.'; return; }
      await new Promise((r) => setTimeout(r, 1500));
    }
    msg.textContent = 'Your payment went through but Pro has not unlocked yet. Wait a minute, then use "Restore access".';
  }
  async function buy(plan, btn) {
    const msg = $('#buy-msg');
    if (!cfg.paddle) { msg.textContent = 'Payments are not set up on this site yet.'; return; }
    btn.disabled = true;
    try {
      const P = await loadPaddle();
      P.Checkout.open({ items: [{ priceId: cfg.paddle.prices[plan] || cfg.paddle.prices.monthly, quantity: 1 }] });
    } catch (e) { msg.textContent = 'Could not open the checkout. Check your connection or ad blocker and try again.'; }
    btn.disabled = false;
  }

  // ---------- init ----------
  async function init() {
    form.addEventListener('submit', submit);
    $$('input[name=regime]', form).forEach((r) => r.addEventListener('change', syncRegime));
    form.elements.dueDate.max = isoLocal(new Date(Date.now() + 366 * 86400000));
    fillForm(store.get('dw.mine', {}));
    const q = new URLSearchParams(location.search);
    if (['uk', 'eu', 'contract', 'none'].includes(q.get('regime'))) fillForm({ regime: q.get('regime') });
    $('#example-btn').addEventListener('click', example);
    $('#ics-btn').addEventListener('click', () => { if (lastIcs) download('dunwell-chase.ics', 'text/calendar', lastIcs); });
    $('#export-btn').addEventListener('click', exportTracker);
    $('#import-btn').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', (e) => { if (e.target.files[0]) importTracker(e.target.files[0]); e.target.value = ''; });
    if (window.DunwellAPI) { $('#export-btn').hidden = true; $('#import-btn').hidden = true; }
    $$('#buy [data-plan]').forEach((b) => b.addEventListener('click', () => buy(b.getAttribute('data-plan'), b)));

    const dlg = $('#restore-dialog');
    $('#restore-open').addEventListener('click', () => { $('#restore-err').textContent = ''; dlg.showModal(); });
    $('#restore-cancel').addEventListener('click', () => dlg.close());
    $('#restore-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const { status, data } = await api.restore({ email: $('#restore-email').value });
      if (status === 200) { dlg.close(); window.location.href = '/?welcome=1#tool'; }
      else $('#restore-err').textContent = data.error || 'Could not restore access.';
    });
    $('#manage-btn').addEventListener('click', async () => {
      const { status, data } = await api.portal();
      if (status === 200 && data.url) window.location.href = data.url;
      else banner(data.error || 'Could not open billing.', 'warn');
    });

    if (q.get('welcome')) banner('Pro is active on this device. Thank you. Every step of the chase is now unlocked.', 'ok');
    if (q.has('welcome')) history.replaceState(null, '', location.pathname + location.hash);

    const { status, data } = await api.config();
    if (status === 200) cfg = data;
    applyConfig();
    renderTracker();
    if (cfg.preview) banner('Preview build: figures and letters are generated in your browser. Printing, the calendar file, email links, payments and AI tailoring are only in the real app.', 'warn');
  }
  init();
})();
