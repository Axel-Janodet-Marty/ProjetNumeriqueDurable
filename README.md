# EcoTroc 🌱

> Plateforme sobre de don et de troc d'objets entre étudiants EFREI Paris.

**Mini-Projet Numérique Durable — TI616 — EFREI Paris 2025-2026**

---

## Description

EcoTroc est une application web légère permettant aux étudiants de l'EFREI de donner ou d'échanger des objets (livres, électronique, mobilier, vêtements…) sans intermédiaire. L'accent est mis sur la **sobriété numérique** : aucune dépendance front-end externe, poids de page < 200 Ko, < 15 requêtes HTTP par page.

🌐 **URL déployée :** _(à compléter après déploiement)_

---

## Équipe

| Membre | Rôle |
|--------|------|
| Axel Janodet-Marty | Développeur Full-stack / Chef de projet |
| _(Prénom Nom)_ | Développeur Back-end / Base de données |
| _(Prénom Nom)_ | Développeur Front-end / Design |

---

## Stack technique & justification Green IT

| Technologie | Justification éco-conception |
|-------------|------------------------------|
| **Node.js + Express** | Runtime léger, faible consommation mémoire vs frameworks lourds |
| **SQLite (better-sqlite3)** | Pas de serveur de base de données séparé, requêtes synchrones rapides |
| **HTML5/CSS3 natif** | Zéro framework front-end, poids minimal |
| **Vanilla JavaScript** | Aucune dépendance CDN, bundle nul |
| **Gzip (compression)** | Réduction ~70% du poids des réponses réseau |
| **bcryptjs** | Hachage sécurisé des mots de passe côté serveur |
| **express-session** | Authentification légère sans JWT (pas de payload supplémentaire) |

**Dépendances totales : 5** (vs ~150 pour une app React/Next.js standard)

---

## Installation et lancement local

### Prérequis
- Node.js ≥ 18.0.0
- npm

### Étapes

```bash
# 1. Cloner le dépôt
git clone https://github.com/Axel-Janodet-Marty/ProjetNumeriqueDurable.git
cd ProjetNumeriqueDurable

# 2. Installer les dépendances
npm install

# 3. Configurer les variables d'environnement
cp .env.example .env
# Éditez .env et renseignez SESSION_SECRET avec une chaîne aléatoire longue

# 4. Initialiser la base de données
npm run init-db

# 5. Lancer le serveur
npm start
```

Ouvrir **http://localhost:3000**

**Compte admin de test :** `admin@efrei.net` / `Admin1234!efrei`

---

## Structure du dépôt

```
ecotroc/
├── server.js              # Point d'entrée Express (config, middlewares, démarrage)
├── Init-db.js             # Initialisation du schéma SQLite + données de test
├── package.json
├── .env.example           # Template des variables d'environnement
├── .gitignore
│
├── routes/                # Routes séparées par domaine
│   ├── auth.js            # POST /api/auth/register|login|logout, GET /api/auth/me
│   ├── users.js           # CRUD /api/users (admin + self)
│   └── annonces.js        # CRUD /api/annonces (entité métier)
│
├── public/                # Fichiers statiques servis directement
│   ├── index.html         # Accueil — liste des annonces
│   ├── login.html         # Connexion
│   ├── register.html      # Inscription
│   ├── Profile.html       # Profil utilisateur + mes annonces
│   ├── create-annonce.html# Créer une annonce
│   ├── Edit annonce.html  # Modifier une annonce
│   ├── Admin.html         # Tableau de bord administrateur
│   ├── style.css          # Feuille de style unique (minifiée)
│   ├── script.js          # Utilitaires JS partagés (minifiés)
│   ├── favicon.svg        # Favicon SVG ~200 octets
│   └── robots.txt
│
└── docs/                  # Documentation
    ├── uml-cas-utilisation.puml
    ├── uml-classes.puml
    ├── uml-sequence.puml
    └── tests-fonctionnels.md
```

---

## Conventions de commit

```
feat: nouvelle fonctionnalité
fix: correction de bug
perf: amélioration de performance
style: changement visuel ou CSS
refactor: restructuration du code sans changement fonctionnel
docs: documentation
chore: maintenance (deps, config)
```

Exemples :
```
feat: ajout du CRUD annonces avec pagination
fix: correction contraste couleur --text-hint (WCAG AA)
perf: compression WebP des images uploadées
refactor: séparation routes auth/users/annonces
```

---

## Rapport PDF

📄 [Voir le rapport](docs/rapport.pdf) _(à ajouter)_

---

## Métriques Green IT cibles

| Indicateur | Objectif | Résultat |
|------------|----------|----------|
| Score Lighthouse Performance | > 80/100 | _(à mesurer)_ |
| Score Lighthouse Accessibilité | > 90/100 | _(à mesurer)_ |
| Poids de page (index) | < 200 Ko | ~50 Ko ✅ |
| Requêtes HTTP / page | < 15 | ~5 ✅ |
| Dépendances npm | Minimal | 5 ✅ |
| Polices externes | 0 | 0 ✅ |
