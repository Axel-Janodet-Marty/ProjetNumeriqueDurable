'use strict';
const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const path     = require('path');

const db = new Database(path.join(__dirname, 'database.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
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
  CREATE INDEX IF NOT EXISTS idx_annonces_date      ON annonces(created_at);
`);

/* Ajout colonne image_path si migration depuis ancienne version */
try {
  db.exec('ALTER TABLE annonces ADD COLUMN image_path TEXT DEFAULT NULL');
  console.log('✓ Colonne image_path ajoutée (migration).');
} catch (_) { /* Déjà présente */ }

if (db.prepare('SELECT COUNT(*) as n FROM utilisateurs').get().n === 0) {
  const ins = db.prepare('INSERT INTO utilisateurs(nom,email,mot_de_passe,role) VALUES(?,?,?,?)');
  ins.run('Admin EcoTroc', 'admin@efrei.net',       bcrypt.hashSync('Admin1234!efrei',10), 'admin');
  ins.run('Marie Dupont',  'marie.dupont@efrei.net', bcrypt.hashSync('Demo12345678!',10),   'user');
  ins.run('Lucas Martin',  'lucas.martin@efrei.net', bcrypt.hashSync('Demo12345678!',10),   'user');

  const ins2 = db.prepare(
      'INSERT INTO annonces(titre,categorie,etat,description,auteur_id) VALUES(?,?,?,?,?)'
  );
  [
    ['Algorithmes & Structures de données','Livres','Bon état','Cormen édition 3, annotations crayon.',2],
    ['Chaise de bureau réglable','Mobilier','Très bon état','Hauteur réglable, accoudoirs. Résidence B.',2],
    ['Câble HDMI 2m','Électronique','Neuf','Dans sa boîte d\'origine.',3],
    ['Veste polaire taille M','Vêtements','Bon état','Couleur grise, lavée, sans taches.',3],
    ['Casserole inox 20cm','Cuisine','Usagé','Fonctionnelle, rayures intérieures.',2],
    ['Lot stylos + surligneurs','Autre','Bon état','12 stylos bleus, 4 surligneurs.',3],
  ].forEach(s=>ins2.run(...s));
  console.log('✓ DB initialisée. Admin: admin@efrei.net / Admin1234!efrei');
} else {
  console.log('ℹ DB déjà initialisée.');
}
db.close();