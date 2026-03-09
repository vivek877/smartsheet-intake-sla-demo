import cron from 'node-cron';
import { Request as ReqModel } from '../models/Request.js';

async function runOnce() {
  const now = new Date();
  const filter = { priority: 'High', status: 'Open', dueDate: { $lt: now } } as any;
  const toEscalate = await ReqModel.find(filter).limit(50);
  for (const r of toEscalate) {
    r.status = 'Escalated';
    r.audit.push({ action: 'auto-escalate', by: 'system', diff: { status: { from: 'Open', to: 'Escalated' } } });
    await r.save();
  }
}

export function scheduleSlaJob() {
  try {
    cron.schedule('* * * * *', () => {
      runOnce().catch(err => console.error('SLA job error', err));
    });
    console.log('SLA cron scheduled: every minute');
  } catch (e) {
    console.log('Cron not available, using setInterval fallback');
    setInterval(() => runOnce().catch(()=>{}), 60_000);
  }
}