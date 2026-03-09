import { Router } from 'express';
import { Request as ReqModel } from '../models/Request.js';

const router = Router();

router.get('/summary', async (_req, res) => {
  const [open, inprog, resolved, escalated, dueToday, breached] = await Promise.all([
    ReqModel.countDocuments({ status: 'Open' }),
    ReqModel.countDocuments({ status: 'In Progress' }),
    ReqModel.countDocuments({ status: 'Resolved' }),
    ReqModel.countDocuments({ status: 'Escalated' }),
    ReqModel.countDocuments({ dueDate: {
      $gte: new Date(new Date().setHours(0,0,0,0)),
      $lte: new Date(new Date().setHours(23,59,59,999))
    }}),
    ReqModel.countDocuments({ priority: 'High', status: { $in: ['Open','Escalated'] }, dueDate: { $lt: new Date() } })
  ]);
  res.json({ open, inProgress: inprog, resolved, escalated, dueToday, breached });
});

export default router;