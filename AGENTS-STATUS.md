# AGENTS-STATUS.md — État du projet au 26/05/2026

## Statut : Déployé — corrections en cours

Site en ligne : https://romainfjgaspard.github.io/lafaurie_ludo/
Firestore : projet `lafaurie-ludo` (données importées ~82 jeux)

---

## Corrections appliquées (26/05/2026)

### Affichage (frontend)
- **Images** : `GameCover` construit l'URL correcte avec `BASE_URL + images/games/`
- **Catégories** : traduites en français via `src/utils/translateCategory.ts`
- **Descriptions** : retirées (étaient en anglais, BGG ne fournit pas de FR)
- **Colonne Casier** : ajoutée dans le tableau après "Note" (triable)

### Données Firestore (script `fixGameNames.ts`)
- **7 Wonders Duel** : doublon supprimé, extension "Pantheon" (bgg:202976) ajoutée
- **Heat** : doublon supprimé, extension "Tunnel Vision" (bgg:436904) ajoutée
- **Défis Nature** : 4 variantes renommées (Volcans, France, Afrique, Minéraux)
- **Tam Tam** : 2 jeux renommés "Tam Tam Tic Tac" et "Tam Tam Chrono"
- **6 jeux sans BGG** ajoutés : Gaï-Luron, Smilo Animaux Sauvages, RollCubd Master Chef,
  Soirée Escape Game Les 7 Pièces de Cristal, Quiz Années 90, Domino Puzzle Carte de France

### Scripts d'import mis à jour
- `importFirestore.ts` : gère `nomOverride` et section `noBgg`
- `reconciled-games.json` : reflète les corrections ci-dessus
- Nouvelles images téléchargées : `202976.jpg`, `436904.jpg`

---

## À faire manuellement

### Casiers (emplacements)
Tous les jeux ont `emplacement: "A1"` par défaut.
→ Mettre à jour via l'interface admin (champ Casier dans la fiche jeu)

### Jeux sans infos BGG (8 jeux)
Ces jeux ont été ajoutés avec juste le nom, sans métadonnées :
- Tam Tam Tic Tac
- Tam Tam Chrono
- Gaï-Luron
- Smilo Animaux Sauvages
- RollCubd Master Chef
- Soirée Escape Game : Les 7 Pièces de Cristal
- Quiz Années 90
- Domino Puzzle Carte de France

→ Compléter via l'interface admin (joueurs, durée, âge...)

### Compte admin
```bash
npx tsx scripts/admin/setAdminClaim.ts <email>
```

### Déploiement GitHub Pages
Push sur `main` → build auto → GitHub Pages.
S'assurer que Settings → Pages → Source = "GitHub Actions"
