'use strict';
const path = require('path');
const fs   = require('fs');

/* Chargement du fichier .env AVANT tout require() qui lit process.env */
try {
  const envFile = path.join(__dirname, '.env');
  if (fs.existsSync(envFile)) {
    fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
      const [key, ...vals] = line.split('=');
      if (key && !key.startsWith('#') && !(key.trim() in process.env))
        process.env[key.trim()] = vals.join('=').trim();
    });
  }
} catch (_) {}

const express     = require('express');
const session     = require('express-session');
const compression = require('compression');
const bcrypt      = require('bcryptjs');
const db          = require('./db');

const PORT       = process.env.PORT || 3000;
const SECRET     = process.env.SESSION_SECRET;
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
const PAGE_SIZE  = 12;

if (!SECRET) {
  console.error('ERREUR : SESSION_SECRET non défini.');
  process.exit(1);
}

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/* ── App Express ─────────────────────────────── */
const app = express();
app.set('trust proxy', 1);
app.use(compression());
app.use(express.json({ limit: '600kb' }));
app.use(express.urlencoded({ extended: false }));

/* ── En-têtes de sécurité HTTP ───────────────── */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

/* ── Fichiers statiques ──────────────────────── */
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', etag: true }));

/* ── Sessions ────────────────────────────────── */
app.use(session({
  secret: SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax'
  }
}));

/* ── Cache-Control API ───────────────────────── */
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

/* ── Rate limiting ───────────────────────────── */
const _rl = new Map();
function rateLimit(max = 10, ms = 60_000) {
  return (req, res, next) => {
    const key = req.ip + req.path, now = Date.now();
    const d = _rl.get(key) || { c: 0, r: now + ms };
    if (now > d.r) { d.c = 0; d.r = now + ms; }
    d.c++; _rl.set(key, d);
    if (d.c > max)
      return res.status(429).json({ message: 'Trop de tentatives. Attendez 1 min.' });
    next();
  };
}
setInterval(() => { const n = Date.now(); for (const [k, v] of _rl) if (n > v.r) _rl.delete(k); }, 5 * 60_000);

/* ── Helpers auth ────────────────────────────── */
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ message: 'Authentification requise.' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.userId || req.session.role !== 'admin')
    return res.status(403).json({ message: 'Accès réservé aux administrateurs.' });
  next();
}

/* ── Purge annonces > 30 jours ───────────────── */
async function purger() {
  const { changes } = await db.prepare(`DELETE FROM annonces WHERE created_at < date('now','-30 days')`).run();
  if (changes > 0) console.log(`♻ Purgé ${changes} annonce(s) > 30 jours.`);
}

/* ── Stats (hero) ────────────────────────────── */
app.get('/api/stats', async (req, res) => {
  try {
    const { n: annonces } = await db.prepare(`SELECT COUNT(*) as n FROM annonces WHERE statut='disponible'`).get();
    const { n: dons }     = await db.prepare(`SELECT COUNT(*) as n FROM annonces WHERE statut='donne'`).get();
    const { n: users }    = await db.prepare('SELECT COUNT(*) as n FROM utilisateurs').get();
    return res.json({ annonces, dons, users });
  } catch (err) {
    return res.json({ annonces: 0, dons: 0, users: 0 });
  }
});

/* ── Routes séparées ─────────────────────────── */
app.use('/api/auth',     require('./routes/auth')(db, rateLimit));
app.use('/api/users',    require('./routes/users')(db, requireAuth, requireAdmin, PAGE_SIZE));
app.use('/api/annonces', require('./routes/annonces')(db, requireAuth, UPLOAD_DIR, PAGE_SIZE));

/* ── Gestionnaire d'erreurs global ───────────── */
app.use((err, req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Erreur interne.' });
});

/* ── Démarrage async ─────────────────────────── */
async function start() {
  await db.pragma('journal_mode = WAL');
  await db.pragma('foreign_keys = ON');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS utilisateurs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      nom          TEXT    NOT NULL,
      email        TEXT    NOT NULL UNIQUE,
      mot_de_passe TEXT    NOT NULL,
      role         TEXT    NOT NULL DEFAULT 'user',
      created_at   TEXT    NOT NULL DEFAULT (strftime('%d/%m/%Y', 'now'))
    );
    CREATE INDEX IF NOT EXISTS idx_utilisateurs_email ON utilisateurs(email);
    CREATE TABLE IF NOT EXISTS annonces (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      titre       TEXT    NOT NULL,
      categorie   TEXT    NOT NULL,
      etat        TEXT    NOT NULL,
      description TEXT    DEFAULT '',
      image_path  TEXT    DEFAULT NULL,
      statut      TEXT    NOT NULL DEFAULT 'disponible',
      auteur_id   INTEGER NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (strftime('%d/%m/%Y', 'now')),
      FOREIGN KEY (auteur_id) REFERENCES utilisateurs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_annonces_categorie ON annonces(categorie);
    CREATE INDEX IF NOT EXISTS idx_annonces_statut    ON annonces(statut);
    CREATE INDEX IF NOT EXISTS idx_annonces_auteur    ON annonces(auteur_id);
    CREATE INDEX IF NOT EXISTS idx_annonces_date      ON annonces(created_at)
  `);

  try {
    await db.exec('ALTER TABLE annonces ADD COLUMN image_path TEXT DEFAULT NULL');
  } catch (_) {}

  const { n } = await db.prepare('SELECT COUNT(*) as n FROM utilisateurs').get();
  if (n === 0) {
    await db.prepare('INSERT INTO utilisateurs(nom,email,mot_de_passe,role) VALUES(?,?,?,?)')
      .run('Admin EcoTroc', 'admin@efrei.net', bcrypt.hashSync('Admin1234!efrei', 10), 'admin');
    console.log('✓ Admin créé : admin@efrei.net / Admin1234!efrei');
  }

  await purger();
  setInterval(() => purger().catch(console.error), 24 * 60 * 60_000);

  app.listen(PORT, () => {
    console.log(`✓ EcoTroc → http://localhost:${PORT}`);
    console.log(`  Turso : ${process.env.TURSO_DATABASE_URL ? 'activé' : 'fichier local'}`);
  });
}

start().catch(err => {
  console.error('Erreur démarrage :', err.message);
  process.exit(1);
});
