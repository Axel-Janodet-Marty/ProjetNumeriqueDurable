'use strict';
const express = require('express');
const path    = require('path');
const fs      = require('fs');

module.exports = function annoncesRouter(db, requireAuth, UPLOAD_DIR, PAGE_SIZE) {
  const router = express.Router();

  function sauvegarderImage(base64) {
    if (!base64 || !base64.startsWith('data:image/')) return null;
    const ext  = base64.match(/data:image\/(\w+);/)?.[1] || 'webp';
    const data = base64.split(',')[1];
    if (!data) return null;
    if (Buffer.byteLength(data, 'base64') > 256 * 1024)
      throw new Error('Image trop lourde après compression (max 250 Ko).');
    const nom = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, nom), Buffer.from(data, 'base64'));
    return nom;
  }

  router.get('/', (req, res) => {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const offset = (page - 1) * PAGE_SIZE;
    const cat = req.query.categorie || '';
    const q   = (req.query.q || '').trim();
    const conds = [`a.statut='disponible'`], params = [];
    if (cat && cat !== 'tous') { conds.push('a.categorie=?'); params.push(cat); }
    if (q) { conds.push('(a.titre LIKE ? OR a.description LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    const where = 'WHERE ' + conds.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) as n FROM annonces a ${where}`).get(...params).n;
    const annonces = db.prepare(
      `SELECT a.id,a.titre,a.categorie,a.etat,a.description,a.statut,a.created_at,a.image_path,
              u.nom as auteur,u.email as auteur_email
       FROM annonces a JOIN utilisateurs u ON u.id=a.auteur_id
         ${where} ORDER BY a.id DESC LIMIT ? OFFSET ?`
    ).all(...params, PAGE_SIZE, offset);
    return res.json({
      annonces: annonces.map(a => ({ ...a, auteur_email: undefined })),
      total, page, pages: Math.ceil(total / PAGE_SIZE)
    });
  });

  router.get('/mes', requireAuth, (req, res) => {
    const annonces = db.prepare(
      'SELECT id,titre,categorie,etat,statut,image_path,created_at FROM annonces WHERE auteur_id=? ORDER BY id DESC'
    ).all(req.session.userId);
    return res.json({ annonces });
  });

  /* /mes doit être déclaré avant /:id pour éviter la collision */
  router.get('/:id', (req, res) => {
    const a = db.prepare(
      `SELECT a.id,a.titre,a.categorie,a.etat,a.description,a.statut,a.auteur_id,
              a.image_path,a.created_at,u.nom as auteur
       FROM annonces a JOIN utilisateurs u ON u.id=a.auteur_id WHERE a.id=?`
    ).get(parseInt(req.params.id));
    if (!a) return res.status(404).json({ message: 'Annonce introuvable.' });
    return res.json(a);
  });

  router.get('/:id/contact', requireAuth, (req, res) => {
    const a = db.prepare(
      'SELECT u.email,u.nom FROM annonces a JOIN utilisateurs u ON u.id=a.auteur_id WHERE a.id=?'
    ).get(parseInt(req.params.id));
    if (!a) return res.status(404).json({ message: 'Annonce introuvable.' });
    return res.json({ email: a.email, nom: a.nom });
  });

  router.post('/', requireAuth, (req, res) => {
    const { titre, categorie, etat, description, image } = req.body;
    if (!titre || !categorie || !etat)
      return res.status(400).json({ message: 'Titre, catégorie et état sont requis.' });
    if (titre.length > 80)
      return res.status(400).json({ message: 'Titre trop long (80 car. max).' });
    try {
      const imagePath = image ? sauvegarderImage(image) : null;
      const r = db.prepare(
        `INSERT INTO annonces(titre,categorie,etat,description,image_path,auteur_id) VALUES(?,?,?,?,?,?)`
      ).run(titre.trim(), categorie, etat, (description || '').slice(0, 300), imagePath, req.session.userId);
      return res.status(201).json({ message: 'Annonce publiée.', id: r.lastInsertRowid });
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }
  });

  router.put('/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const a  = db.prepare('SELECT id,auteur_id,image_path FROM annonces WHERE id=?').get(id);
    if (!a) return res.status(404).json({ message: 'Annonce introuvable.' });
    if (a.auteur_id !== req.session.userId && req.session.role !== 'admin')
      return res.status(403).json({ message: 'Accès refusé.' });
    const { titre, categorie, etat, description, statut, image } = req.body;
    if (!titre || !categorie || !etat)
      return res.status(400).json({ message: 'Titre, catégorie et état sont requis.' });
    try {
      let imagePath = a.image_path;
      if (image && image.startsWith('data:image/')) {
        imagePath = sauvegarderImage(image);
        if (a.image_path) {
          const old = path.join(UPLOAD_DIR, a.image_path);
          if (fs.existsSync(old)) fs.unlinkSync(old);
        }
      }
      db.prepare(
        `UPDATE annonces SET titre=?,categorie=?,etat=?,description=?,statut=?,image_path=? WHERE id=?`
      ).run(titre.trim(), categorie, etat, (description || '').slice(0, 300), statut || 'disponible', imagePath, id);
      return res.json({ message: 'Annonce mise à jour.' });
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }
  });

  router.delete('/:id', requireAuth, (req, res) => {
    const id = parseInt(req.params.id);
    const a  = db.prepare('SELECT id,auteur_id,image_path FROM annonces WHERE id=?').get(id);
    if (!a) return res.status(404).json({ message: 'Annonce introuvable.' });
    if (a.auteur_id !== req.session.userId && req.session.role !== 'admin')
      return res.status(403).json({ message: 'Accès refusé.' });
    if (a.image_path) {
      const f = path.join(UPLOAD_DIR, a.image_path);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }
    db.prepare('DELETE FROM annonces WHERE id=?').run(id);
    return res.json({ message: 'Annonce supprimée.' });
  });

  return router;
};
