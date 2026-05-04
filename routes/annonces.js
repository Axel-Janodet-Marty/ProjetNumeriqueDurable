'use strict';
const express    = require('express');
const multer     = require('multer');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Seules les images sont autorisées.'));
  },
});

function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'ecotroc', resource_type: 'image' },
      (err, result) => { if (err) reject(err); else resolve(result.secure_url); }
    );
    stream.end(buffer);
  });
}

module.exports = function annoncesRouter(db, requireAuth, _UPLOAD_DIR, PAGE_SIZE) {
  const router = express.Router();

  function resolveImageUrl(a) {
    if (a.image_url) return a.image_url;
    if (a.has_image_data) return `/api/annonces/${a.id}/image`;
    return null;
  }

  router.get('/', async (req, res) => {
    try {
      const page   = Math.max(1, parseInt(req.query.page) || 1);
      const offset = (page - 1) * PAGE_SIZE;
      const cat = req.query.categorie || '';
      const q   = (req.query.q || '').trim();
      const conds = [`a.statut='disponible'`], params = [];
      if (cat && cat !== 'tous') { conds.push('a.categorie=?'); params.push(cat); }
      if (q) { conds.push('(a.titre LIKE ? OR a.description LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
      const where = 'WHERE ' + conds.join(' AND ');
      const { n: total } = await db.prepare(`SELECT COUNT(*) as n FROM annonces a ${where}`).get(...params);
      const rows = await db.prepare(
        `SELECT a.id,a.titre,a.categorie,a.etat,a.description,a.statut,a.created_at,
                a.image_url,(a.image_data IS NOT NULL) as has_image_data,
                u.nom as auteur,
                (SELECT COUNT(*) FROM annonces a2 WHERE a2.auteur_id=a.auteur_id) as nb_dons_auteur
         FROM annonces a JOIN utilisateurs u ON u.id=a.auteur_id
           ${where} ORDER BY a.id DESC LIMIT ? OFFSET ?`
      ).all(...params, PAGE_SIZE, offset);
      const annonces = rows.map(a => {
        const url = resolveImageUrl(a);
        return { ...a, image_url: url, has_image: !!url };
      });
      return res.json({ annonces, total, page, pages: Math.ceil(total / PAGE_SIZE) });
    } catch (err) {
      return res.status(500).json({ message: 'Erreur interne.' });
    }
  });

  router.get('/mes', requireAuth, async (req, res) => {
    try {
      const rows = await db.prepare(
        `SELECT id,titre,categorie,etat,statut,image_url,
                (image_data IS NOT NULL) as has_image_data,created_at
         FROM annonces WHERE auteur_id=? ORDER BY id DESC`
      ).all(req.session.userId);
      const annonces = rows.map(a => {
        const url = resolveImageUrl(a);
        return { ...a, image_url: url, has_image: !!url };
      });
      return res.json({ annonces });
    } catch (err) {
      return res.status(500).json({ message: 'Erreur interne.' });
    }
  });

  /* Rétrocompatibilité : sert les anciennes images base64 depuis la DB */
  router.get('/:id/image', async (req, res) => {
    try {
      const row = await db.prepare('SELECT image_data FROM annonces WHERE id=?').get(parseInt(req.params.id));
      if (!row || !row.image_data) return res.status(404).end();
      const [header, b64] = row.image_data.split(',');
      const mime = (header.match(/data:([^;]+);/) || [])[1] || 'image/webp';
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(Buffer.from(b64, 'base64'));
    } catch (err) {
      return res.status(500).end();
    }
  });

  router.get('/:id/contact', requireAuth, async (req, res) => {
    try {
      const a = await db.prepare(
        'SELECT u.email,u.nom FROM annonces a JOIN utilisateurs u ON u.id=a.auteur_id WHERE a.id=?'
      ).get(parseInt(req.params.id));
      if (!a) return res.status(404).json({ message: 'Annonce introuvable.' });
      return res.json({ email: a.email, nom: a.nom });
    } catch (err) {
      return res.status(500).json({ message: 'Erreur interne.' });
    }
  });

  router.get('/:id', async (req, res) => {
    try {
      const a = await db.prepare(
        `SELECT a.id,a.titre,a.categorie,a.etat,a.description,a.statut,a.auteur_id,
                a.image_url,(a.image_data IS NOT NULL) as has_image_data,a.created_at,u.nom as auteur
         FROM annonces a JOIN utilisateurs u ON u.id=a.auteur_id WHERE a.id=?`
      ).get(parseInt(req.params.id));
      if (!a) return res.status(404).json({ message: 'Annonce introuvable.' });
      a.image_url = resolveImageUrl(a);
      a.has_image = !!(a.image_url);
      return res.json(a);
    } catch (err) {
      return res.status(500).json({ message: 'Erreur interne.' });
    }
  });

  router.post('/', requireAuth, upload.single('photo'), async (req, res) => {
    const { titre, categorie, etat, description, image } = req.body;
    if (!titre || !categorie || !etat)
      return res.status(400).json({ message: 'Titre, catégorie et état sont requis.' });
    if (titre.length > 80)
      return res.status(400).json({ message: 'Titre trop long (80 car. max).' });
    try {
      let image_url = null;
      if (req.file) {
        // Nouveau chemin : FormData → Cloudinary
        image_url = await uploadToCloudinary(req.file.buffer);
      } else if (image && image.startsWith('data:image/')) {
        // Chemin legacy : ancien frontend (base64 JSON) → Cloudinary
        const b64 = image.split(',')[1];
        if (b64) image_url = await uploadToCloudinary(Buffer.from(b64, 'base64'));
      }
      const r = await db.prepare(
        `INSERT INTO annonces(titre,categorie,etat,description,image_url,auteur_id) VALUES(?,?,?,?,?,?)`
      ).run(titre.trim(), categorie, etat, (description || '').slice(0, 300), image_url, req.session.userId);
      return res.status(201).json({ message: 'Annonce publiée.', id: r.lastInsertRowid });
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }
  });

  router.put('/:id', requireAuth, upload.single('photo'), async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      const a = await db.prepare('SELECT id,auteur_id,image_url FROM annonces WHERE id=?').get(id);
      if (!a) return res.status(404).json({ message: 'Annonce introuvable.' });
      if (a.auteur_id !== req.session.userId && req.session.role !== 'admin')
        return res.status(403).json({ message: 'Accès refusé.' });
      const { titre, categorie, etat, description, statut } = req.body;
      if (!titre || !categorie || !etat)
        return res.status(400).json({ message: 'Titre, catégorie et état sont requis.' });
      let image_url = a.image_url;
      if (req.file) {
        image_url = await uploadToCloudinary(req.file.buffer);
      }
      await db.prepare(
        `UPDATE annonces SET titre=?,categorie=?,etat=?,description=?,statut=?,image_url=? WHERE id=?`
      ).run(titre.trim(), categorie, etat, (description || '').slice(0, 300), statut || 'disponible', image_url, id);
      return res.json({ message: 'Annonce mise à jour.' });
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }
  });

  router.post('/:id/signaler', async (req, res) => {
    const id = parseInt(req.params.id);
    const { raison } = req.body;
    const raisons_valides = ['Contenu inapproprié','Objet déjà donné','Fausse annonce','Autre'];
    if (!raison || !raisons_valides.includes(raison))
      return res.status(400).json({ message: 'Raison invalide.' });
    try {
      const a = await db.prepare('SELECT id FROM annonces WHERE id=?').get(id);
      if (!a) return res.status(404).json({ message: 'Annonce introuvable.' });
      await db.prepare('INSERT INTO signalements(annonce_id,raison) VALUES(?,?)').run(id, raison);
      return res.json({ message: 'Signalement envoyé. Merci pour votre vigilance !' });
    } catch (err) {
      return res.status(500).json({ message: 'Erreur interne.' });
    }
  });

  router.delete('/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      const a = await db.prepare('SELECT id,auteur_id FROM annonces WHERE id=?').get(id);
      if (!a) return res.status(404).json({ message: 'Annonce introuvable.' });
      if (a.auteur_id !== req.session.userId && req.session.role !== 'admin')
        return res.status(403).json({ message: 'Accès refusé.' });
      await db.prepare('DELETE FROM annonces WHERE id=?').run(id);
      return res.json({ message: 'Annonce supprimée.' });
    } catch (err) {
      return res.status(500).json({ message: 'Erreur interne.' });
    }
  });

  return router;
};
