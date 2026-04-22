'use strict';
const express = require('express');
const bcrypt  = require('bcryptjs');

module.exports = function authRouter(db, rateLimit) {
  const router = express.Router();

  router.post('/register', rateLimit(5, 60_000), (req, res) => {
    const { nom, email, password } = req.body;
    if (!nom || !email || !password)
      return res.status(400).json({ message: 'Tous les champs sont obligatoires.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ message: "Format d'e-mail invalide." });
    if (password.length < 14)
      return res.status(400).json({ message: 'Mot de passe trop court (14 caractères minimum).' });
    if (db.prepare('SELECT id FROM utilisateurs WHERE email=?').get(email.toLowerCase()))
      return res.status(409).json({ message: 'Cet e-mail est déjà utilisé.' });
    try {
      const hash = bcrypt.hashSync(password, 10);
      const r = db.prepare('INSERT INTO utilisateurs(nom,email,mot_de_passe) VALUES(?,?,?)')
          .run(nom.trim(), email.toLowerCase(), hash);
      req.session.userId = r.lastInsertRowid;
      req.session.nom    = nom.trim();
      req.session.email  = email.toLowerCase();
      req.session.role   = 'user';
      return res.status(201).json({ message: 'Compte créé.', nom: nom.trim(), role: 'user' });
    } catch (err) {
      console.error('ERREUR REGISTER:', err.message);
      return res.status(500).json({ message: 'Erreur interne du serveur.' });
    }
  });

  router.post('/login', rateLimit(10, 60_000), (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: 'E-mail et mot de passe requis.' });
    const user = db.prepare(
      'SELECT id,nom,email,mot_de_passe,role FROM utilisateurs WHERE email=?'
    ).get(email.toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.mot_de_passe))
      return res.status(401).json({ message: 'Identifiants incorrects.' });
    req.session.userId = user.id;
    req.session.nom    = user.nom;
    req.session.email  = user.email;
    req.session.role   = user.role;
    return res.json({ message: 'Connecté.', nom: user.nom, role: user.role });
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => res.json({ message: 'Déconnecté.' }));
  });

  router.get('/me', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ connecte: false });
    return res.json({
      connecte: true,
      id:    req.session.userId,
      nom:   req.session.nom,
      email: req.session.email,
      role:  req.session.role
    });
  });

  return router;
};
