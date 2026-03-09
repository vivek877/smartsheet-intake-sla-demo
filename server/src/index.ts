import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import fileUpload from 'express-fileupload';
import { connectDB } from './lib/db.js';
import requestsRouter from './routes/requests.js';
import statsRouter from './routes/stats.js';
import { scheduleSlaJob } from './jobs/sla.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

const allowed = (process.env.ALLOWED_ORIGINS || '*').split(',');
app.use(cors({ origin: (origin, cb) => cb(null, true), credentials: true }));
app.use(express.json());
app.use(fileUpload());
app.use(morgan('dev'));

app.get('/health', (_, res) => res.json({ ok: true }));

app.use('/api/requests', requestsRouter);
app.use('/api/stats', statsRouter);

connectDB().then(() => {
  app.listen(PORT, () => console.log(`API listening on :${PORT}`));
  scheduleSlaJob();
}).catch(err => {
  console.error('DB connection failed', err);
  process.exit(1);
});