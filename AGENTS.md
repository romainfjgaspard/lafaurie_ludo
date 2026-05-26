# AGENTS.md — bredy_ludo

## Présentation du projet

Application web familiale de gestion de ludothèque (jeux de société), déployée sur GitHub Pages.

- **URL** : https://romainfjgaspard.github.io/bredy_ludo/
- **Repo** : https://github.com/romainfjgaspard/bredy_ludo.git
- **Stack** : Vue 3 + Vite + TypeScript + Tailwind v4 + Firebase Firestore + Chart.js

## Fonctionnalités principales

| Onglet | Description |
|--------|-------------|
| Bibliothèque | Liste filtrée et tableau trié de la ludothèque (~214 jeux) |
| Roue | Sélectionner des jeux par filtre et lancer une roue de décision animée |
| Stats | Dashboard statistiques (parties jouées, jeux oubliés, top jeux...) |
| Admin | CRUD jeux, protégé par authentification Firebase (admin claim) |

## Architecture

```
src/
├── domain/        — types TypeScript (Game, Play, Profile, Filters, Location)
├── services/      — Firebase Firestore + Auth
├── stores/        — Pinia (gamesStore, playsStore, filtersStore, wheelStore, authStore)
├── composables/   — useGameFilters, useWheel
├── utils/         — textNormalize, ratingCalc, gameFilters, imageUrl, dateUtils
├── components/    — layout/, common/, library/, wheel/, stats/, admin/
└── views/         — LibraryView, GameDetailView, WheelView, StatsView, AdminView, LoginView
scripts/
├── import/        — import BGG + Firestore (tsx)
└── admin/         — setAdminClaim (one-shot)
```

## Firebase

- **Projet** : bredy-ludo
- **Firestore** : europe-west9 (Paris), id=(default)
- **Auth** : Email/Password
- **Admins** : pargass31@gmail.com, siegfrid100102@yahoo.fr
- **Règles** : games write = isAdmin(), plays create = true, delete = isAdmin()

## Conventions

- Langue : **français** (code en anglais/français mixte, UI 100% français)
- Commits : `feat:`, `fix:`, `ci:`, `chore:` en français
- Avant push : `git fetch origin main ; git merge origin/main --no-edit`
- Images jeux : `public/images/games/{bggId}.jpg`, fallback `placeholder.jpg`
- `image_url` Firestore = `"{bggId}.jpg"`, URL construite côté client
- BGG XML API v2 : encore en attente d'approbation (données fakes pour l'instant)

## Commandes clés

```bash
npm run dev              # Serveur local
npm run build            # Build prod (vue-tsc + vite)
npm run test             # Vitest
npm run import:fake      # Génère les données de test (214 jeux fake)
npm run import:update    # Upsert Firestore par nom de jeu
npx tsx scripts/admin/setAdminClaim.ts <email>  # Set admin claim
```

## Variables d'environnement (.env.local)

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_APP_ID
```
