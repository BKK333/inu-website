import express from 'express';
import session from 'express-session';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import fs from 'node:fs';

const app = express();
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'backend', 'data');
const dataFile = path.join(dataDir, 'store.json');
fs.mkdirSync(dataDir, { recursive: true });

type NewsItem = { id: number; title: string; body: string; category: string; date: string };
type AdminItem = { username: string; password_hash: string };
type Store = { admins: AdminItem[]; news: NewsItem[] };

const seeds: NewsItem[] = [
  { id: 1, title: 'الجامعة تفتتح معرضاً فنياً وإبداعياً احتفاءً بمواهب طلبتها', body: 'افتتحت جامعة إربد الأهلية معرضاً فنياً تشكيلياً للرسم في مرسم الجامعة ضمن برنامج استقبال الطلبة المستجدين.', category: 'الحياة الجامعية', date: '21 أكتوبر 2026' },
  { id: 2, title: 'استعدادات الجامعة لاستقبال طلبة العام الجامعي 2026/2027', body: 'تستعد الجامعة لاستقبال طلبتها مع انطلاق الفصل الدراسي الأول وسط جاهزية أكاديمية وإدارية وخدمية.', category: 'إعلانات', date: '14 أكتوبر 2026' },
  { id: 3, title: 'تخفيض الرسوم الفصلية لطلبة البكالوريوس والماجستير', body: 'أعلنت الجامعة تخفيض الرسوم الفصلية من 370 إلى 350 ديناراً اعتباراً من الفصل الأول 2026/2027.', category: 'القبول والتسجيل', date: '6 أكتوبر 2026' },
  { id: 4, title: 'مجلس الأمناء يعقد أولى جلساته للعام الجامعي 2026/2027', body: 'عقد مجلس أمناء جامعة إربد الأهلية أولى جلساته للعام الجامعي الجديد.', category: 'مجالس الجامعة', date: '1 أكتوبر 2026' }
];

function readStore(): Store {
  if (!fs.existsSync(dataFile)) {
    const username = process.env.ADMIN_USER || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'INU-ChangeMe-2026!';
    const initial: Store = { admins: [{ username, password_hash: bcrypt.hashSync(password, 12) }], news: seeds };
    fs.writeFileSync(dataFile, JSON.stringify(initial, null, 2), 'utf8');
    return initial;
  }
  try { return JSON.parse(fs.readFileSync(dataFile, 'utf8')) as Store; }
  catch { throw new Error(`تعذر قراءة ملف البيانات: ${dataFile}`); }
}
function writeStore(store: Store) { fs.writeFileSync(dataFile, JSON.stringify(store, null, 2), 'utf8'); }

app.use(express.json({ limit: '1mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'replace-this-session-secret-before-deployment',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 4 }
}));
const auth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if ((req.session as any).admin) return next();
  res.status(401).json({ error: 'unauthorized' });
};

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const admin = readStore().admins.find(x => x.username === String(username || ''));
  if (!admin || !bcrypt.compareSync(String(password || ''), admin.password_hash)) return res.status(401).json({ error: 'بيانات الدخول غير صحيحة' });
  (req.session as any).admin = admin.username;
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/news', (_req, res) => res.json([...readStore().news].sort((a, b) => b.id - a.id)));
app.post('/api/news', auth, (req, res) => {
  const { title, body, category = 'عام', date = new Date().toLocaleDateString('ar-JO') } = req.body || {};
  if (typeof title !== 'string' || title.trim().length < 3 || title.length > 220 || typeof body !== 'string' || body.trim().length < 5 || body.length > 20000) return res.status(400).json({ error: 'بيانات غير صالحة' });
  const store = readStore();
  const id = Math.max(0, ...store.news.map(x => x.id)) + 1;
  store.news.push({ id, title: title.trim(), body: body.trim(), category: String(category).slice(0, 80), date: String(date).slice(0, 40) });
  writeStore(store);
  res.status(201).json({ id });
});
app.delete('/api/news/:id', auth, (req, res) => {
  const store = readStore();
  const before = store.news.length;
  store.news = store.news.filter(x => x.id !== Number(req.params.id));
  writeStore(store);
  res.json({ deleted: store.news.length < before });
});
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Serve the built React application from the same public service.
const distDir = path.resolve(process.cwd(), 'dist');
app.use(express.static(distDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(distDir, 'index.html'), (error) => {
    if (error) next(error);
  });
});

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  readStore();
  console.log(`INU server listening on port ${port}`);
});
