// Everything that is sold, as data. Pages, checkout and access checks all read
// from here, so a price or plan change is an edit to this file and nothing else.
// Money is in euro cents.

export type Stage = 'Agree' | 'Bill' | 'Collect' | 'See';

export type Feature =
  | 'chase.autopilot'
  | 'chase.paypage'
  | 'chase.record'
  | 'chase.formal'
  | 'contracts.build'
  | 'contracts.check'
  | 'contracts.sign'
  | 'billing.recurring'
  | 'billing.terms'
  | 'billing.documents'
  | 'insight.forecast';

export type PlanId = 'chase' | 'contracts' | 'billing' | 'all';

export type Plan = {
  id: PlanId;
  name: string;
  stage: string;
  monthly: number;
  yearly: number | null; // null: no yearly price set yet
  points: string[];
  features: Feature[];
  jobCredits: number; // quick jobs included each month
};

const CHASE: Feature[] = ['chase.autopilot', 'chase.paypage', 'chase.record', 'chase.formal'];
const CONTRACTS: Feature[] = ['contracts.build', 'contracts.check', 'contracts.sign'];
const BILLING: Feature[] = ['billing.recurring', 'billing.terms', 'billing.documents', 'insight.forecast'];

export const PLANS: Plan[] = [
  {
    id: 'chase', name: 'Chase', stage: 'Collect', monthly: 1200, yearly: null,
    points: ['Autopilot reminders in your name', 'A live payment page for each client', 'Opens, replies and a dated record'],
    features: CHASE, jobCredits: 0,
  },
  {
    id: 'contracts', name: 'Contracts', stage: 'Agree', monthly: 1200, yearly: null,
    points: ['Unlimited contracts from reviewed clauses', 'Health checks on contracts you are sent', 'Click-to-sign with an audit trail'],
    features: CONTRACTS, jobCredits: 0,
  },
  {
    id: 'billing', name: 'Billing', stage: 'Bill and see', monthly: 900, yearly: null,
    points: ['Invoices and recurring invoices', 'Terms pulled in from the contract', 'Income forecast and client scores'],
    features: BILLING, jobCredits: 0,
  },
  {
    id: 'all', name: 'All access', stage: 'Everything', monthly: 2500, yearly: 24000,
    points: ['Chase, Contracts and Billing together', 'Five quick jobs every month'],
    features: [...CHASE, ...CONTRACTS, ...BILLING], jobCredits: 5,
  },
];

export type JobId =
  | 'contract-brief' | 'letter-before-claim' | 'contract-check' | 'full-chase'
  | 'payment-plan' | 'dispute-reply' | 'change-order' | 'statement';

export type Job = {
  id: JobId;
  name: string;
  price: number;
  includedWith: Feature; // a plan holding this feature never pays for the job
};

export const JOBS: Job[] = [
  { id: 'contract-brief', name: 'Contract from a short brief', price: 900, includedWith: 'contracts.build' },
  { id: 'letter-before-claim', name: 'Letter before claim + evidence', price: 900, includedWith: 'chase.formal' },
  { id: 'contract-check', name: 'Contract health check', price: 700, includedWith: 'contracts.check' },
  { id: 'full-chase', name: 'Full chase for one invoice', price: 500, includedWith: 'chase.autopilot' },
  { id: 'payment-plan', name: 'Payment plan agreement', price: 500, includedWith: 'chase.formal' },
  { id: 'dispute-reply', name: 'Dispute reply', price: 500, includedWith: 'chase.formal' },
  { id: 'change-order', name: 'Change order', price: 400, includedWith: 'billing.documents' },
  { id: 'statement', name: 'Statement of account', price: 300, includedWith: 'billing.documents' },
];

export type Tool = {
  stage: Stage;
  name: string;
  line: string;
  price: string;
  // 'live' tools have an href. 'building' tools are shown but not linked.
  status: 'live' | 'building';
  href?: string;
};

const CURRENT = 'https://dunwell.monarchcode.io/#tool';

export const TOOLS: Tool[] = [
  { stage: 'Agree', price: 'from €9', name: 'Contract builder', line: 'Answer six questions. Get a contract that protects your payment.', status: 'building' },
  { stage: 'Agree', price: '€7', name: 'Contract health check', line: 'Upload a contract you were sent. See what is missing or stacked against you.', status: 'building' },
  { stage: 'Agree', price: 'Free', name: 'Late-fee clause', line: 'The exact wording to add to your terms, by country.', status: 'building' },
  { stage: 'Bill', price: 'Free', name: 'Invoice maker', line: 'A clean invoice with your terms and a scan-to-pay code.', status: 'building' },
  { stage: 'Bill', price: '€4', name: 'Change order', line: 'Scope grew? Get it agreed in writing before you do the work.', status: 'building' },
  { stage: 'Bill', price: '€3', name: 'Statement of account', line: 'Everything one client owes you, on one page.', status: 'building' },
  { stage: 'Collect', price: 'Free', name: 'Interest calculator', line: 'What the law lets you add to a late invoice, to the day.', status: 'live', href: CURRENT },
  { stage: 'Collect', price: 'Plan', name: 'Chase autopilot', line: 'Enter the invoice once. Five steps go out on schedule.', status: 'building' },
  { stage: 'Collect', price: '€9', name: 'Letter before claim', line: 'The formal last step, with an evidence pack attached.', status: 'building' },
  { stage: 'Collect', price: '€5', name: 'Payment plan', line: 'Instalments both sides sign, tracked until the last one lands.', status: 'building' },
  { stage: 'Collect', price: '€5', name: 'Dispute reply', line: 'A calm, structured answer when a client pushes back.', status: 'building' },
  { stage: 'See', price: 'Plan', name: 'Income forecast', line: 'Contracted, invoiced, paid and overdue, month by month.', status: 'building' },
];

export function euro(cents: number): string {
  return '€' + (cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2));
}
