# Tests fonctionnels — EcoTroc

> Mini-Projet Numérique Durable — TI616 — EFREI Paris 2025-2026

## Légende

| Symbole | Signification |
|---------|---------------|
| ✅ | Passé |
| ❌ | Échoué |
| ⏳ | Non testé |

---

## 1. Authentification

| # | Scénario | Étapes | Résultat attendu | Statut |
|---|----------|--------|-----------------|--------|
| A-01 | Inscription valide | Remplir le formulaire avec une adresse @efrei.net et un mot de passe ≥ 8 caractères → Envoyer | Compte créé, redirection vers `/index.html` | ✅ |
| A-02 | Inscription email dupliqué | Tenter de créer un compte avec un email déjà utilisé | Réponse 409 + message "Email déjà utilisé" | ✅ |
| A-03 | Inscription email non-EFREI | Saisir une adresse non `@efrei.net` | Refus avec message d'erreur | ✅ |
| A-04 | Connexion identifiants corrects | Saisir email + mot de passe valides | Session ouverte, redirection vers `/index.html` | ✅ |
| A-05 | Connexion identifiants incorrects | Saisir un mauvais mot de passe | Réponse 401 + message "Identifiants incorrects" | ✅ |
| A-06 | Déconnexion | Cliquer "Se déconnecter" | Session détruite, redirection vers `/login.html` | ✅ |
| A-07 | Rate limiting inscription | Envoyer > 5 requêtes POST /api/auth/register en 1 minute | Réponse 429 après la 5e requête | ✅ |
| A-08 | Rate limiting connexion | Envoyer > 10 requêtes POST /api/auth/login en 1 minute | Réponse 429 après la 10e requête | ✅ |

---

## 2. Gestion des annonces

| # | Scénario | Étapes | Résultat attendu | Statut |
|---|----------|--------|-----------------|--------|
| AN-01 | Publier une annonce | Se connecter → Créer une annonce → Remplir le formulaire + photo → Envoyer | Annonce créée (201), toast "Annonce publiée !", photo enregistrée en `.webp` | ✅ |
| AN-02 | Publier sans photo | Soumettre le formulaire sans image | Annonce créée sans image (image_path null) | ✅ |
| AN-03 | Image trop grande (>250 Ko) | Envoyer une image dont la base64 dépasse 250 Ko | Réponse 400 + message "Image trop grande" | ✅ |
| AN-04 | Afficher la liste des annonces | Aller sur `/index.html` | Annonces affichées, 12 par page, paginées | ✅ |
| AN-05 | Filtrer par catégorie | Sélectionner "Livres" dans le filtre | Seules les annonces "Livres" sont affichées | ✅ |
| AN-06 | Filtrer par état | Sélectionner "Neuf" dans le filtre | Seules les annonces "Neuf" sont affichées | ✅ |
| AN-07 | Modifier une annonce (auteur) | Cliquer "Modifier" sur sa propre annonce → Changer le titre → Envoyer | Annonce mise à jour (200) | ✅ |
| AN-08 | Modifier une annonce (autre utilisateur) | Tenter PUT /api/annonces/:id sur une annonce d'un autre | Réponse 403 | ✅ |
| AN-09 | Supprimer une annonce (auteur) | Cliquer "Supprimer" sur sa propre annonce | Annonce supprimée (200) | ✅ |
| AN-10 | Marquer comme "Donné" | Cliquer "Marquer comme donné" | Statut passe à "donne", bouton désactivé | ✅ |
| AN-11 | Contacter un donneur | Cliquer "Contacter" sur une annonce disponible | Email de l'auteur révélé (authentification requise) | ✅ |
| AN-12 | Contacter sans être connecté | Tenter GET /api/annonces/:id/contact sans session | Réponse 401 | ✅ |

---

## 3. Profil utilisateur

| # | Scénario | Étapes | Résultat attendu | Statut |
|---|----------|--------|-----------------|--------|
| P-01 | Afficher le profil | Accéder à `/Profile.html` connecté | Nom, email et liste des annonces affichés | ✅ |
| P-02 | Modifier le nom | Changer le nom dans le profil → Enregistrer | Nom mis à jour (200) | ✅ |
| P-03 | Supprimer son compte | Cliquer "Supprimer mon compte" → Confirmer | Compte supprimé, annonces supprimées (CASCADE), redirection `/login.html` | ✅ |
| P-04 | Accès profil sans connexion | Tenter d'accéder à `/Profile.html` non connecté | Redirection vers `/login.html` | ✅ |

---

## 4. Administration

| # | Scénario | Étapes | Résultat attendu | Statut |
|---|----------|--------|-----------------|--------|
| ADM-01 | Accès panel admin (admin) | Se connecter avec un compte `role=admin` → `/Admin.html` | Liste des utilisateurs + annonces affichée | ✅ |
| ADM-02 | Accès panel admin (user) | Tenter d'accéder à `GET /api/users` avec un compte standard | Réponse 403 | ✅ |
| ADM-03 | Supprimer un utilisateur (admin) | Cliquer "Supprimer" sur un utilisateur dans le panel | Utilisateur et ses annonces supprimés | ✅ |
| ADM-04 | Supprimer une annonce (admin) | Cliquer "Supprimer" sur une annonce dans le panel | Annonce supprimée | ✅ |

---

## 5. Sécurité & en-têtes HTTP

| # | Scénario | Commande de vérification | Résultat attendu | Statut |
|---|----------|--------------------------|-----------------|--------|
| S-01 | X-Content-Type-Options | `curl -I http://localhost:3000/` | Header `X-Content-Type-Options: nosniff` présent | ✅ |
| S-02 | X-Frame-Options | `curl -I http://localhost:3000/` | Header `X-Frame-Options: DENY` présent | ✅ |
| S-03 | Referrer-Policy | `curl -I http://localhost:3000/` | Header `Referrer-Policy: strict-origin-when-cross-origin` présent | ✅ |
| S-04 | Permissions-Policy | `curl -I http://localhost:3000/` | Header `Permissions-Policy` présent | ✅ |
| S-05 | SESSION_SECRET obligatoire | Démarrer sans variable SESSION_SECRET | Serveur refuse de démarrer avec message d'erreur explicite | ✅ |
| S-06 | Cookie httpOnly | Inspecter les cookies dans DevTools | Cookie `session` avec flag `httpOnly` | ✅ |
| S-07 | Injection SQL | Envoyer `email = "' OR 1=1 --"` dans le formulaire de login | Réponse 401 (requête paramétrée, pas d'injection) | ✅ |

---

## 6. Performance & Green IT

| # | Critère | Méthode de vérification | Cible | Statut |
|---|---------|------------------------|-------|--------|
| G-01 | Nombre de requêtes HTTP | DevTools → Network (page d'accueil) | < 15 requêtes | ✅ |
| G-02 | Poids de page | DevTools → Network → taille totale | < 200 Ko | ✅ |
| G-03 | Compression gzip | `curl -H "Accept-Encoding: gzip" -I http://localhost:3000/` | Header `Content-Encoding: gzip` | ✅ |
| G-04 | Images WebP | Inspecter `public/uploads/` après une publication | Fichiers `.webp` uniquement | ✅ |
| G-05 | Lazy loading images | Inspecter `<img>` dans l'HTML | Attribut `loading="lazy"` présent | ✅ |
| G-06 | Polices système | Inspecter `font-family` dans style.css | Aucune police externe chargée | ✅ |
| G-07 | Lighthouse Performance | Chrome DevTools → Lighthouse | Score > 80 | ⏳ |
| G-08 | Lighthouse Accessibilité | Chrome DevTools → Lighthouse | Score > 90 | ⏳ |
| G-09 | Lighthouse SEO | Chrome DevTools → Lighthouse | Score = 100 | ⏳ |
| G-10 | EcoIndex | [ecoindex.fr](https://www.ecoindex.fr) | Grade A ou B | ⏳ |

---

## 7. Accessibilité (WCAG AA)

| # | Critère | Vérification | Résultat attendu | Statut |
|---|---------|-------------|-----------------|--------|
| ACC-01 | Contraste texte principal | WCAG Contrast Checker : `#143d2b` sur `#fdf7f0` | ≥ 4,5:1 | ✅ |
| ACC-02 | Contraste texte hint | WCAG Contrast Checker : `#5e706a` sur `#fdf7f0` | ≥ 4,5:1 (4,95:1) | ✅ |
| ACC-03 | Navigation clavier | Tabuler à travers le formulaire de login | Focus visible sur chaque champ et bouton | ✅ |
| ACC-04 | aria-label mode sombre | Inspecter `#btn-dark` dans login.html | `aria-label="Mode sombre"` présent | ✅ |
| ACC-05 | Balises sémantiques | Inspecter l'HTML | `<header>`, `<main>`, `<footer>`, `<nav>` utilisés | ✅ |
| ACC-06 | Alt sur les images | Inspecter les `<img>` | Attribut `alt` présent sur toutes les images | ✅ |
