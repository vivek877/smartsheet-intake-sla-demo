import { Router } from 'express';
import { Request as ReqModel } from '../models/Request.js';
import stringify from 'csv-stringify';

const router = Router();

function parseNum(v: any, d: number) { const n = parseInt(String(v)); return Number.isFinite(n) ? n : d; }

router.get('/', async (req, res) => {
  const { q, status, priority, assignee, from, to, page=1, limit=10, sort='-createdAt' } = req.query as Record<string,string>;
  const filter: any = {};
  if (q) filter.$or = [
    { title: { $regex: q, $options: 'i' } },
    { customer: { $regex: q, $options: 'i' } },
    { description: { $regex: q, $options: 'i' } },
    { tags: { $regex: q, $options: 'i' } },
  ];
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (assignee) filter.assignee = assignee;
  if (from || to) filter.createdAt = {};
  if (from) filter.createdAt.$gte = new Date(from);
  if (to) filter.createdAt.$lte = new Date(to);

  const pageNum = parseNum(page, 1);
  const limitNum = Math.min(parseNum(limit, 10), 100);

  const [items, total] = await Promise.all([
    ReqModel.find(filter).sort(sort).skip((pageNum-1)*limitNum).limit(limitNum).lean(),
    ReqModel.countDocuments(filter)
  ]);

  res.json({ items, total, page: pageNum, limit: limitNum });
});

router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const doc = await ReqModel.create({
      customer: body.customer,
      title: body.title,
      description: body.description,
      priority: body.priority || 'Medium',
      status: body.status || 'Open',
      assignee: body.assignee,
      dueDate: body.dueDate,
      tags: body.tags || [],
      attachments: body.attachments || [],
      comments: [],
      audit: [{ action: 'create', by: 'demo-user' }]
    });
    res.status(201).json(doc);
  } catch (e:any) {
    res.status(400).json({ message: e.message });
  }
});

router.get('/:id', async (req, res) => {
  const doc = await ReqModel.findById(req.params.id).lean();
  if (!doc) return res.status(404).json({ message: 'Not found' });
  res.json(doc);
});

router.patch('/:id', async (req, res, next) => {
  try {
    const update = req.body;
    const doc = await ReqModel.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!doc) return res.status(404).json({ message: 'Not found' });
    res.json(doc);
  } catch (e:any) {
    res.status(400).json({ message: e.message });
  } finally { next?.(); }
}, async (_req,_res)=>{});

router.delete('/:id', async (req, res) => {
  const doc = await ReqModel.findByIdAndDelete(req.params.id);
  if (!doc) return res.status(404).json({ message: 'Not found' });
  res.json({ ok: true });
});

router.post('/:id/comments', async (req, res) => {
  const { text, by } = req.body;
  if (!text) return res.status(400).json({ message: 'text required' });
  const upd = await ReqModel.findByIdAndUpdate(req.params.id, { $push: { comments: { text, by: by || 'demo-user' } } }, { new: true });
  if (!upd) return res.status(404).json({ message: 'Not found' });
  res.json(upd);
});

// CSV export
router.get('/export/csv', async (_req, res) => {
  const items = await ReqModel.find({}).lean();
  const columns = [
    '_id','customer','title','description','priority','status','assignee','dueDate','tags','createdAt','updatedAt'
  ];
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="requests.csv"');
  const stringifier = stringify({ header: true, columns });
  stringifier.pipe(res);
  for (const it of items) {
    stringifier.write({
      _id: String(it._id),
      customer: it.customer,
      title: it.title,
      description: it.description || '',
      priority: it.priority,
      status: it.status,
      assignee: it.assignee || '',
      dueDate: it.dueDate ? new Date(it.dueDate).toISOString() : '',
      tags: (it.tags||[]).join('|'),
      createdAt: it.createdAt?.toISOString?.() || '',
      updatedAt: it.updatedAt?.toISOString?.() || ''
    });
  }
  stringifier.end();
});

export default router;