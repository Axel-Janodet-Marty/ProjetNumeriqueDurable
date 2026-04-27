'use strict';
const express = require('express');

module.exports = function usersRouter(db, requireAuth, requireAdmin, PAGE_SIZE) {
  const router = express.Router();

  router.get('/', requireAdmin, async (req, res) => {
    try {
      const page   = Math.max(1, parseInt(req.query.page) || 1);
      const offset = (page - 1) * PAGE_SIZE;
      const { n: total } = await db.prepare('SELECT COUNT(*) as n FROM utilisateurs').get();
      const users = await db.prepare(
        'SELECT id,nom,email,role,created_at FROM utilisateurs ORDER BY id DESC LIMIT ? OFFSET ?'
      ).all(PAGE_SIZE, offset);
      return res.json({ users, total, page, pages: Math.ceil(total / PAGE_SIZE) });
    } catch (err) {
      return res.status(500).json({ message: 'Erreur interne.' });
    }
  });

  router.put('/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (req.session.userId !== id && req.session.role !== 'admin')
      return res.status(403).json({ message: 'Accès refusé.' });
    const { nom, email } = req.body;
    if (!nom || !email)
      return res.status(400).json({ message: 'Nom et e-mail requis.' });
    try {
      if (await db.prepare('SELECT id FROM utilisateurs WHERE email=? AND id!=?').get(email.toLowerCase(), id))
        return res.status(409).json({ message: 'Cet e-mail est déjà utilisé.' });
      await db.prepare('UPDATE utilisateurs SET nom=?,email=? WHERE id=?')
        .run(nom.trim(), email.toLowerCase(), id);
      if (req.session.userId === id) {
        req.session.nom   = nom.trim();
        req.session.email = email.toLowerCase();
      }
      return res.json({ message: 'Profil mis à jour.' });
    } catch (err) {
      return res.status(500).json({ message: 'Erreur interne.' });
    }
  });

  router.delete('/:id', requireAuth, async (req, res) => {
    const id = parseInt(req.params.id);
    if (req.session.userId !== id && req.session.role !== 'admin')
      return res.status(403).json({ message: 'Accès refusé.' });
    try {
      const r = await db.prepare('DELETE FROM utilisateurs WHERE id=?').run(id);
      if (r.changes === 0) return res.status(404).json({ message: 'Utilisateur introuvable.' });
      if (req.session.userId === id)
        req.session.destroy(() => res.json({ message: 'Compte supprimé.' }));
      else
        return res.json({ message: 'Utilisateur supprimé.' });
    } catch (err) {
      return res.status(500).json({ message: 'Erreur interne.' });
    }
  });

  return router;
};
