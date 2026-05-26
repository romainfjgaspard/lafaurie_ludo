# AGENTS-STATUS.md — État du projet au 26/05/2026

## Statut : Initialisation

Projet créé à partir de bredy_ludo. Firebase project et import BGG à configurer.

---

## À faire (dans l'ordre)

### 1. Créer le projet Firebase
- Console Firebase → nouveau projet `lafaurie-ludo`
- Activer Firestore, Authentication (Email/Password)
- Récupérer les credentials web → remplir `.env.local`
- Mettre à jour `.firebaserc` avec l'ID réel du projet
- Déployer les règles et index Firestore :
  ```bash
  npx firebase deploy --only firestore:rules,firestore:indexes
  ```

### 2. Import BGG depuis ludo.xlsx
```bash
npm install
npm run import:parse        # lire le xlsx
npm run import:bgg          # chercher sur BGG (nécessite BGG_USERNAME/BGG_PASSWORD dans .env.local)
npm run import:reconcile    # associer les jeux
npm run import:report       # rapport
npm run import:images       # télécharger les images
npm run import:check        # vérifier
npm run import:dry          # dry-run import Firestore
npm run import:run          # import réel
```

### 3. GitHub Pages
- Settings → Pages → Source → "GitHub Actions"
- Ajouter les secrets Firebase dans les secrets GitHub du repo

### 4. Compte admin
```bash
npx tsx scripts/admin/setAdminClaim.ts <email>
```
