/*
 * Dunwell engine: late-payment interest maths + the chase sequence.
 * Pure functions, no I/O. Runs in Node (server) and in the browser (preview build).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DunwellEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DAY = 86400000;

  /*
   * Reference rates per half-year. MAINTAIN TWICE A YEAR (early January, early July).
   *  - UK: Bank of England base rate in force on 31 Dec applies 1 Jan-30 Jun;
   *        the rate on 30 Jun applies 1 Jul-31 Dec. Statutory rate = base + 8.
   *  - EU: ECB main refinancing rate in force on 1 Jan / 1 Jul applies to that
   *        half-year. Directive 2011/7/EU minimum = reference + 8 points.
   * Each entry: [first day of the half-year, reference rate %].
   */
  const RATES_VERIFIED = '2026-11-10';
  const REGIMES = {
    uk: {
      currency: 'GBP', margin: 8, refName: 'Bank of England base rate',
      periods: [
        ['2022-01-01', 0.25], ['2022-07-01', 1.25], ['2023-01-01', 3.5], ['2023-07-01', 5.0],
        ['2024-01-01', 5.25], ['2024-07-01', 5.25], ['2025-01-01', 4.75], ['2025-07-01', 4.25],
        ['2026-01-01', 3.75], ['2026-07-01', 3.75]
      ]
    },
    eu: {
      currency: 'EUR', margin: 8, refName: 'ECB reference rate',
      periods: [
        ['2022-01-01', 0.0], ['2022-07-01', 0.0], ['2023-01-01', 2.5], ['2023-07-01', 4.0],
        ['2024-01-01', 4.5], ['2024-07-01', 4.25], ['2025-01-01', 3.15], ['2025-07-01', 2.15],
        ['2026-01-01', 2.15], ['2026-07-01', 2.15]
      ]
    }
  };
  const EARLIEST_STATUTORY = '2022-01-01';
  const CURRENCIES = ['GBP', 'EUR', 'USD', 'CAD', 'AUD', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN'];
  const OFFSETS = [3, 10, 21, 35, 45];

  // ---------- dates (whole UTC days) ----------
  function parseDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const ms = Date.parse(s + 'T00:00:00Z');
    if (isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== s) return null;
    return Math.round(ms / DAY);
  }
  const toISO = (n) => new Date(n * DAY).toISOString().slice(0, 10);
  function halfStart(n) {
    const d = new Date(n * DAY);
    return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() < 6 ? 0 : 6, 1) / DAY);
  }
  function nextHalf(hs) {
    const d = new Date(hs * DAY);
    return Math.round((d.getUTCMonth() === 0
      ? Date.UTC(d.getUTCFullYear(), 6, 1) : Date.UTC(d.getUTCFullYear() + 1, 0, 1)) / DAY);
  }
  const fmtDate = (n) => new Intl.DateTimeFormat('en-GB',
    { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(n * DAY));
  const fmtMoney = (v, cur) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur }).format(v);
  const round2 = (v) => Math.round((v + Number.EPSILON) * 100) / 100;
  const fmtRate = (r) => String(Math.round(r * 100) / 100);

  function refRate(regime, hs) {
    const p = REGIMES[regime].periods;
    let ref = p[0][1], found = parseDate(p[0][0]);
    for (const [start, rate] of p) {
      const s = parseDate(start);
      if (s <= hs) { ref = rate; found = s; }
    }
    return { ref, provisional: found !== hs };
  }

  // ---------- interest ----------
  function calcInterest(inp, asOf) {
    const { amount, regime } = inp;
    const days = Math.max(0, asOf - inp.due);
    const segments = [];
    let interest = 0, rate = 0, ref = null, provisional = false;

    if (regime === 'uk' || regime === 'eu') {
      const margin = regime === 'eu' ? inp.margin : REGIMES.uk.margin;
      const cur = refRate(regime, halfStart(asOf));
      rate = cur.ref + margin; ref = cur.ref;
      let from = inp.due + 1;
      while (from <= asOf) {
        const hs = halfStart(from);
        const to = Math.min(asOf, nextHalf(hs) - 1);
        const r = refRate(regime, hs);
        const d = to - from + 1;
        const amt = amount * (r.ref + margin) / 100 * d / 365;
        if (r.provisional) provisional = true;
        segments.push({ from: toISO(from), to: toISO(to), days: d, refRate: r.ref,
          rate: r.ref + margin, interest: round2(amt), provisional: r.provisional });
        interest += amt;
        from = to + 1;
      }
    } else if (regime === 'contract') {
      rate = inp.contractRate;
      if (days > 0) {
        interest = amount * rate / 100 * days / 365;
        segments.push({ from: toISO(inp.due + 1), to: toISO(asOf), days, refRate: null,
          rate, interest: round2(interest), provisional: false });
      }
    }

    let compensation = 0;
    if (days > 0) {
      if (regime === 'uk') compensation = amount < 1000 ? 40 : amount < 10000 ? 70 : 100;
      else if (regime === 'eu') compensation = 40;
      else if (regime === 'contract') compensation = inp.lateFee;
    }
    interest = round2(interest);
    return {
      asOf: toISO(asOf), days, rate, refRate: ref, interest, compensation,
      total: round2(amount + interest + compensation),
      daily: round2(amount * rate / 100 / 365), segments, provisional
    };
  }

  // ---------- input validation ----------
  const clean = (v, max) => (typeof v === 'string' ? v : v == null ? '' : String(v))
    .replace(/\r\n/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F]/g, '').trim().slice(0, max);

  function normalize(raw, todayOverride) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const errors = {};
    const regime = ['uk', 'eu', 'contract', 'none'].includes(raw.regime) ? raw.regime : null;
    if (!regime) errors.regime = 'Choose how interest should be worked out.';

    const amount = Number(String(raw.amount == null ? '' : raw.amount).replace(/[,\s]/g, ''));
    if (!isFinite(amount) || amount <= 0) errors.amount = 'Enter the amount owed, e.g. 1250.00.';
    else if (amount > 100000000) errors.amount = 'That amount is too large for this tool.';

    const serverToday = Math.floor(Date.now() / DAY);
    let today = parseDate(todayOverride || raw.today);
    if (today == null || Math.abs(today - serverToday) > 1) today = serverToday;

    const due = parseDate(raw.dueDate);
    if (due == null) errors.dueDate = 'Enter the date payment was due.';
    else if (due > today + 366) errors.dueDate = 'The due date is more than a year away.';
    else if ((regime === 'uk' || regime === 'eu') && due < parseDate(EARLIEST_STATUTORY))
      errors.dueDate = 'For invoices due before 2022, choose "Contract rate" and enter the rate yourself.';
    else if (due < today - 3660) errors.dueDate = 'That due date is more than ten years ago.';

    let currency = regime === 'uk' ? 'GBP' : regime === 'eu' ? 'EUR' : clean(raw.currency, 3).toUpperCase();
    if (!CURRENCIES.includes(currency)) currency = 'EUR';

    let margin = 8, contractRate = 0, lateFee = 0;
    if (regime === 'eu') {
      margin = raw.margin === undefined || raw.margin === '' ? 8 : Number(raw.margin);
      if (!isFinite(margin) || margin < 0 || margin > 20) errors.margin = 'Enter a margin between 0 and 20 points.';
    }
    if (regime === 'contract') {
      const r = Number(raw.contractRate);
      if (!isFinite(r) || r <= 0) errors.contractRate = 'Enter the late-payment rate from your contract.';
      else {
        contractRate = raw.ratePer === 'month' ? r * 12 : r;
        if (contractRate > 60) errors.contractRate = 'That is above 60% a year. Check the rate and whether it is per month or per year.';
      }
      lateFee = raw.lateFee === undefined || raw.lateFee === '' ? 0 : Number(raw.lateFee);
      if (!isFinite(lateFee) || lateFee < 0 || lateFee > 100000) errors.lateFee = 'Enter a late fee of zero or more.';
    }

    const input = {
      regime, amount: round2(amount), currency, due, today, margin, contractRate, lateFee: round2(lateFee),
      tone: raw.tone === 'direct' ? 'direct' : 'warm',
      invoiceNumber: clean(raw.invoiceNumber, 60),
      invoiceDate: parseDate(raw.invoiceDate),
      clientCompany: clean(raw.clientCompany, 120),
      clientContact: clean(raw.clientContact, 80),
      clientAddress: clean(raw.clientAddress, 400),
      yourName: clean(raw.yourName, 80),
      yourBusiness: clean(raw.yourBusiness, 120),
      yourAddress: clean(raw.yourAddress, 400),
      paymentDetails: clean(raw.paymentDetails, 500)
    };
    if (!input.invoiceNumber) errors.invoiceNumber = 'Enter the invoice number.';
    if (!input.clientCompany) errors.clientCompany = 'Enter who owes you: the client or company name.';
    if (!input.yourName) errors.yourName = 'Enter your name, so the emails can be signed.';
    return { ok: Object.keys(errors).length === 0, errors, input };
  }

  // ---------- the chase ----------
  function schedule(inp) {
    const overdue = inp.today - inp.due;
    let current = -1;
    OFFSETS.forEach((o, i) => { if (overdue >= o) current = i; });
    current = Math.min(current, 3); // never open with the formal letter; give a final notice first
    const out = [];
    let prev = null;
    OFFSETS.forEach((o, i) => {
      let status, sendOn;
      if (i < current) { status = 'earlier'; sendOn = inp.today; }
      else if (i === current) { status = 'now'; sendOn = inp.today; }
      else { status = 'upcoming'; sendOn = Math.max(inp.due + o, prev == null ? 0 : prev + 7); }
      if (status !== 'earlier') prev = sendOn;
      out.push({ status, sendOn, offset: o });
    });
    return out;
  }

  function legalBasis(inp, c, P) {
    const m = (v) => fmtMoney(v, inp.currency);
    if (inp.regime === 'uk')
      return `Under the Late Payment of Commercial Debts (Interest) Act 1998, ${P.weAre} entitled to statutory interest at 8% above the Bank of England base rate (${fmtRate(c.rate)}% a year in total at present) and a fixed sum of ${m(c.compensation)} towards recovery costs.`;
    if (inp.regime === 'eu')
      return `Under the EU Late Payment Directive (2011/7/EU), as implemented in national law, ${P.weAre} entitled to statutory interest of ${fmtRate(inp.margin)} percentage points above the ECB reference rate (${fmtRate(c.rate)}% a year in total at present) and a fixed sum of at least ${m(c.compensation)} towards recovery costs.`;
    if (inp.regime === 'contract')
      return `Under our agreed payment terms, overdue amounts bear interest at ${fmtRate(c.rate)}% a year` +
        (c.compensation > 0 ? ` and a late fee of ${m(c.compensation)}.` : '.');
    return '';
  }

  function amountLines(inp, c) {
    const m = (v) => fmtMoney(v, inp.currency);
    const rows = [`Invoice ${inp.invoiceNumber}: ${m(inp.amount)}`];
    if (c.interest > 0) rows.push(`Interest to ${fmtDate(parseDate(c.asOf))} (${c.days} days): ${m(c.interest)}`);
    if (c.compensation > 0) rows.push(`${inp.regime === 'contract' ? 'Late fee' : 'Compensation for recovery costs'}: ${m(c.compensation)}`);
    if (rows.length > 1) rows.push(`Total now due: ${m(c.total)}`);
    return rows.join('\n');
  }

  function buildSteps(inp) {
    const m = (v) => fmtMoney(v, inp.currency);
    const biz = !!inp.yourBusiness;
    const P = biz
      ? { we: 'we', We: 'We', our: 'our', us: 'us', weAre: 'we are', weHave: 'we have' }
      : { we: 'I', We: 'I', our: 'my', us: 'me', weAre: 'I am', weHave: 'I have' };
    const warm = inp.tone === 'warm';
    const hi = inp.clientContact ? `Hi ${inp.clientContact},` : 'Hello,';
    const dear = inp.clientContact ? `Dear ${inp.clientContact},` : 'Dear Sir or Madam,';
    const sign = inp.yourName + (biz ? `\n${inp.yourBusiness}` : '');
    const pay = inp.paymentDetails
      ? `Payment details:\n${inp.paymentDetails}`
      : `Payment details are on the invoice, and I've attached another copy to this email.`;
    const inv = `invoice ${inp.invoiceNumber}`;
    const dueStr = fmtDate(inp.due);
    const hasCharges = inp.regime !== 'none';
    const sched = schedule(inp);

    const defs = [
      {
        id: 'nudge', title: 'Friendly nudge', tier: 'free', kind: 'email',
        note: 'Send from your usual address and attach the invoice. Most late invoices are settled at this step, so keep it light.',
        make: (c) => ({
          subject: `Invoice ${inp.invoiceNumber}: quick reminder`,
          body: [hi,
            warm
              ? `I hope all is well. A quick note that ${inv} for ${m(inp.amount)} was due on ${dueStr} and doesn't seem to have reached ${P.us} yet.`
              : `${cap(inv)} for ${m(inp.amount)} was due on ${dueStr} and has not been paid.`,
            warm
              ? `It may simply have slipped through. Could you let me know when payment is scheduled?`
              : `Please confirm when payment will be made.`,
            pay,
            `If you've already sent it, thank you, and please ignore this note.`,
            (warm ? 'Best wishes,' : 'Regards,') + '\n' + sign].join('\n\n')
        })
      },
      {
        id: 'followup', title: 'Firm follow-up', tier: 'free', kind: 'email',
        note: 'Ask for a date, not just for payment. A date someone has committed to in writing is much easier to hold them to.',
        make: (c) => ({
          subject: `Invoice ${inp.invoiceNumber}: now ${c.days} days overdue`,
          body: [hi,
            `I'm following up on my earlier reminder. ${cap(inv)} for ${m(inp.amount)} is now ${c.days} days past its due date of ${dueStr}.`,
            `Please arrange payment by ${fmtDate(parseDate(c.asOf) + 5)}, or reply today with the date it will be made.`,
            warm
              ? `If something is holding it up (a query on the invoice, a missing PO number, an approval), tell me and I'll sort it out straight away.`
              : `If there is a query on the invoice, raise it now so it can be resolved without further delay.`,
            pay,
            (warm ? 'Thanks,' : 'Regards,') + '\n' + sign].join('\n\n')
        })
      },
      {
        id: 'interest', title: hasCharges ? 'Interest notice' : 'Escalation notice', tier: 'pro', kind: 'email',
        note: hasCharges
          ? 'The offer to waive charges gives your client a reason to pay this week instead of arguing. Remove that paragraph if you intend to claim them regardless.'
          : 'Naming a consequence and a date turns a reminder into a decision your client has to make.',
        make: (c) => {
          const deadline = fmtDate(parseDate(c.asOf) + 7);
          const parts = [hi,
            `Despite ${P.our} earlier reminders, ${inv} for ${m(inp.amount)} remains unpaid, ${c.days} days after it fell due on ${dueStr}.`];
          if (hasCharges) {
            parts.push(legalBasis(inp, c, P));
            parts.push(`As of ${fmtDate(parseDate(c.asOf))} that comes to:\n${amountLines(inp, c)}` +
              (c.daily > 0 ? `\nInterest continues to accrue at ${m(c.daily)} a day.` : ''));
            parts.push(warm
              ? `${P.We} would much rather not add these. If the invoice amount of ${m(inp.amount)} reaches ${P.us} by ${deadline}, ${P.we} will waive the interest and charges and consider the matter closed. After that date the full amount will be claimed.`
              : `If the invoice amount of ${m(inp.amount)} is received by ${deadline}, ${P.we} will waive the interest and charges. After that date the full amount will be claimed.`);
          } else {
            parts.push(`Please pay the invoice in full by ${deadline}. If ${P.we} have not received payment or heard from you by then, ${P.we} will have to pause any ongoing work and begin formal recovery of the debt.`);
          }
          parts.push(pay, 'Regards,\n' + sign);
          return { subject: `Invoice ${inp.invoiceNumber}: overdue${hasCharges ? ', interest now accruing' : ', action required'}`, body: parts.join('\n\n') };
        }
      },
      {
        id: 'final', title: 'Final notice', tier: 'pro', kind: 'email',
        note: 'Send to your contact and to their accounts or finance address. From here on, keep everything in writing.',
        make: (c) => ({
          subject: `FINAL NOTICE: invoice ${inp.invoiceNumber}, ${m(c.total)} now due`,
          body: [dear,
            `This is a final notice regarding ${inv}, which fell due on ${dueStr} and is now ${c.days} days overdue. Previous reminders have not been answered with payment.`,
            amountLines(inp, c) + (c.daily > 0 ? `\nInterest continues to accrue at ${m(c.daily)} a day until payment.` : ''),
            `Please pay ${m(c.total)} in full within 7 days, by ${fmtDate(parseDate(c.asOf) + 7)}.`,
            `If payment is not received by that date, ${P.we} will begin formal recovery without further reminders. That may include a formal letter before claim and court proceedings, and will add ${hasCharges ? 'further interest and costs' : 'further costs'} to the amount you owe.`,
            `If you dispute any part of this invoice, set out your reasons in writing by the same date.`,
            pay,
            'Regards,\n' + sign].join('\n\n')
        })
      },
      {
        id: 'lba', title: inp.regime === 'uk' ? 'Letter before claim' : 'Formal demand for payment', tier: 'pro', kind: 'letter',
        note: inp.regime === 'uk'
          ? 'Print, sign, and send by tracked post as well as email. If your client is an individual or sole trader, the Pre-Action Protocol for Debt Claims applies instead: you must allow 30 days and enclose its information sheet and reply form.'
          : 'Print, sign, and send by tracked post as well as email. Recovery routes differ by country (for cross-border EU debts, the European Payment Order is one), so speak to a local lawyer before starting proceedings.',
        make: (c) => {
          const deadline = fmtDate(parseDate(c.asOf) + 14);
          const heading = inp.regime === 'uk' ? 'LETTER BEFORE CLAIM' : 'FORMAL DEMAND FOR PAYMENT';
          const from = [biz ? inp.yourBusiness : inp.yourName, inp.yourAddress].filter(Boolean).join('\n');
          const to = [inp.clientCompany, inp.clientAddress].filter(Boolean).join('\n');
          const parts = [from, fmtDate(parseDate(c.asOf)), to, dear,
            `${heading}\nUnpaid invoice ${inp.invoiceNumber}`,
            `${P.We} write regarding ${inv}` + (inp.invoiceDate != null ? `, dated ${fmtDate(inp.invoiceDate)},` : '') +
              ` issued to ${inp.clientCompany}. Payment of ${m(inp.amount)} was due on ${dueStr}. Despite reminders, including a final notice, it remains unpaid ${c.days} days later.`];
          if (hasCharges) parts.push(legalBasis(inp, c, P));
          parts.push(`The amount now owed is:\n${amountLines(inp, c)}` +
            (c.daily > 0 ? `\nInterest continues to accrue at ${m(c.daily)} a day until payment.` : ''));
          parts.push(`${P.We} require payment of ${m(c.total)} in full within 14 days of the date of this letter, that is by ${deadline}.`);
          parts.push(inp.regime === 'uk'
            ? `If payment is not received by that date, ${P.we} intend to issue proceedings in the County Court without further notice to recover the debt${hasCharges ? ', continuing interest,' : ''} and costs. This letter is sent in accordance with the Practice Direction on Pre-Action Conduct. Ignoring it may increase your liability for costs.`
            : `If payment is not received by that date, ${P.we} intend to start legal proceedings without further notice to recover the debt${hasCharges ? ', continuing interest,' : ''} and costs.`);
          parts.push(`${P.We} would prefer to resolve this without proceedings. If you dispute the debt, reply in writing within the same 14 days setting out your reasons in full.`);
          parts.push(inp.paymentDetails ? `Payment details:\n${inp.paymentDetails}` : `Payment details are set out on the invoice, a copy of which is enclosed.`);
          parts.push(`Yours faithfully,\n\n${inp.yourName}` + (biz ? `\n${inp.yourBusiness}` : ''));
          return { subject: `${cap(heading.toLowerCase())}: invoice ${inp.invoiceNumber}`, body: parts.join('\n\n') };
        }
      }
    ];

    return defs.map((d, i) => {
      const s = sched[i];
      const c = calcInterest(inp, s.sendOn);
      const made = d.make(c);
      return {
        id: d.id, n: i + 1, title: d.title, tier: d.tier, kind: d.kind, note: d.note,
        day: s.offset, status: s.status, sendOn: toISO(s.sendOn), sendOnLabel: fmtDate(s.sendOn),
        figuresAsOf: fmtDate(s.sendOn), totalLabel: m(c.total),
        subject: made.subject, body: made.body
      };
    });
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function buildICS(inp, steps) {
    const esc = (s) => s.replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\n/g, '\\n');
    const stamp = toISO(inp.today).replace(/-/g, '') + 'T000000Z';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dunwell//Chase schedule//EN', 'CALSCALE:GREGORIAN'];
    steps.filter((s) => s.status !== 'earlier').forEach((s) => {
      const d = parseDate(s.sendOn);
      lines.push('BEGIN:VEVENT',
        `UID:${s.id}-${inp.due}-${encodeURIComponent(inp.invoiceNumber)}@dunwell`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${s.sendOn.replace(/-/g, '')}`,
        `DTEND;VALUE=DATE:${toISO(d + 1).replace(/-/g, '')}`,
        `SUMMARY:${esc(`Chase ${inp.clientCompany}: ${s.title} (invoice ${inp.invoiceNumber})`)}`,
        `DESCRIPTION:${esc(`Step ${s.n} of 5. Open Dunwell to refresh the figures before sending.`)}`,
        'END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  /** Main entry. opts.pro unlocks steps 3-5 and the calendar file. */
  function chase(raw, opts) {
    opts = opts || {};
    const v = normalize(raw, opts.today);
    if (!v.ok) return { ok: false, errors: v.errors };
    const inp = v.input;
    const m = (x) => fmtMoney(x, inp.currency);
    const c = calcInterest(inp, inp.today);
    const all = buildSteps(inp);
    const steps = all.map((s) => {
      if (s.tier === 'free' || opts.pro) return Object.assign({ locked: false }, s);
      const { body, ...rest } = s;
      return Object.assign(rest, { locked: true, preview: (body.split('\n\n').find((p) => p.length > 80) || body).slice(0, 150) + '…' });
    });
    return {
      ok: true, pro: !!opts.pro,
      summary: {
        regime: inp.regime, currency: inp.currency, days: c.days, dueLabel: fmtDate(inp.due),
        asOfLabel: fmtDate(inp.today), amount: inp.amount, interest: c.interest,
        compensation: c.compensation, total: c.total, rate: c.rate, provisional: c.provisional,
        fmt: { amount: m(inp.amount), interest: m(c.interest), compensation: m(c.compensation),
          total: m(c.total), daily: m(c.daily), rate: fmtRate(c.rate) + '%' },
        segments: c.segments.map((s) => ({
          label: `${fmtDate(parseDate(s.from))} to ${fmtDate(parseDate(s.to))}`,
          days: s.days, rate: fmtRate(s.rate) + '%', interest: m(s.interest), provisional: s.provisional
        }))
      },
      steps,
      ics: opts.pro ? buildICS(inp, all) : null,
      ratesVerified: RATES_VERIFIED
    };
  }

  function currentRates() {
    const hs = halfStart(Math.floor(Date.now() / DAY));
    const out = {};
    for (const k of ['uk', 'eu']) {
      const r = refRate(k, hs);
      out[k] = { ref: fmtRate(r.ref) + '%', total: fmtRate(r.ref + REGIMES[k].margin) + '%', provisional: r.provisional };
    }
    out.verified = fmtDate(parseDate(RATES_VERIFIED));
    return out;
  }

  return { chase, normalize, calcInterest, parseDate, toISO, currentRates, CURRENCIES, OFFSETS, REGIMES, RATES_VERIFIED };
});
