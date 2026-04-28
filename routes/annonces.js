'use strict';
const express = require('express');

module.exports = function annoncesRouter(db, requireAuth, UPLOAD_DIR, PAGE_SIZE) {
  const router = express.Router();

  function validerImage(base64) {
    if (!base64 || !base64.startsWith('data:image/')) return null;
    const data = base64.split(',')[1];
    if (!data) return null;
    if (Buffer.byteLength(data, 'base64') > 256 * 1024)
      throw new Error('Image trop lourde après compression (max 250 Ko).');
    return base64; // stockée telle quelle en DB
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
                (a.image_data IS NOT NULL) as has_image,
                u.nom as auteur
         FROM annonces a JOIN utilisateurs u ON u.id=a.auteur_id
           ${where} ORDER BY a.id DESC LIMIT ? OFFSET ?`
      ).all(...params, PAGE_SIZE, offset);
      return res.json({
        annonces: rows,
        total, page, pages: Math.ceil(total / PAGE_SIZE)
      });
    } catch (err) {
      return res.status(500).json({ message: 'Erreur interne.' });
    }
  });

  router.get('/mes', requireAuth, async (req, res) => {
    try {
      const annonces = await db.prepare(
        `SELECT id,titre,categorie,etat,statut,(image_data IS NOT NULL) as has_image,created_at
         FROM annonces WHERE auteur_id=? ORDER BY id DESC`
      ).all(req.session.userId);
      return res.json({ annonces });
    } catch (err) {
      return res.status(500).json({ message: 'Erreur interne.' });
    }
  });

  /* Sert l'image brute depuis la DB */
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
                (a.image_data IS NOT NULL) as has_image,a.created_at,u.nom as auteur
         FROM annonces a JOIN utilisateurs u ON u.id=a.auteur_id WHERE a.id=?`
      ).get(parseInt(req.params.id));
      if (!a) return res.status(404).json({ message: 'Annonce introuvable.' });
      return res.json(a);
    } catch (err) {
      return res.status(500).json({ message: 'Erreur interne.' });
    }
  });

  router.post('/', requireAuth, async (req, res) => {
    const { titre, categorie, etat, description, image } = req.body;
    if (!titre || !categorie || !etat)
      return res.status(400).json({ message: 'Titre, catégorie et état sont requis.' });
    if (titre.length > 80)
      return res.status(400).json({ message: 'Titre trop long (80 car. max).' });
    try {
      const imageData = image ? validerImage(image) : null;
      const r = await db.prepare(
        `INSERT INTO annonces(titre,categorie,etat,description,image_data,auteur_id) VALUES(?,?,?,?,?,?)`
      ).run(titre.trim(), categorie, etat, (description || '').slice(0, 300), imageData, req.session.userId);
      return res.status(201).json({ message: 'Annonce publiée.', id: r.lastInsertRowid });
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }
  });

  router.put('/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      const a = await db.prepare('SELECT id,auteur_id,image_data FROM annonces WHERE id=?').get(id);
      if (!a) return res.status(404).json({ message: 'Annonce introuvable.' });
      if (a.auteur_id !== req.session.userId && req.session.role !== 'admin')
        return res.status(403).json({ message: 'Accès refusé.' });
      const { titre, categorie, etat, description, statut, image } = req.body;
      if (!titre || !categorie || !etat)
        return res.status(400).json({ message: 'Titre, catégorie et état sont requis.' });
      const imageData = image && image.startsWith('data:image/') ? validerImage(image) : a.image_data;
      await db.prepare(
        `UPDATE annonces SET titre=?,categorie=?,etat=?,description=?,statut=?,image_data=? WHERE id=?`
      ).run(titre.trim(), categorie, etat, (description || '').slice(0, 300), statut || 'disponible', imageData, id);
      return res.json({ message: 'Annonce mise à jour.' });
    } catch (err) {
      return res.status(400).json({ message: err.message });
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
