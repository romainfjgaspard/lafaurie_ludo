/**
 * Corrige les noms de jeux mal importés dans Firestore :
 * - 7 Wonders Duel (Pantheon) : double → supprimer 1 doublon + ajouter la vraie extension
 * - Heat (Tunnel Vision) : même traitement
 * - Défis Nature : renommer les 4 variantes avec leurs vrais noms
 * - Tam Tam : renommer les 2 entrées "Tam Tam" en "Tam Tam Tic Tac" et "Tam Tam Chrono"
 * - Jeux sans BGG : ajouter les jeux absents (notFound + unidentified)
 *
 * Usage : npx tsx scripts/import/fixGameNames.ts [--dry-run]
 */

import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../')
const DRY_RUN = process.argv.includes('--dry-run')

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : JSON.parse(fs.readFileSync(path.join(ROOT, 'service-account.json'), 'utf-8'))

initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()
db.settings({ ignoreUndefinedProperties: true })

const log = (msg: string) => console.log(DRY_RUN ? `[DRY] ${msg}` : msg)

async function getGamesByNom(nom: string) {
  const snap = await db.collection('games').where('nom', '==', nom).get()
  return snap.docs
}

async function getGamesByBggId(bggId: number) {
  const snap = await db.collection('games').where('bgg_id', '==', bggId).get()
  return snap.docs
}

async function main() {
  console.log(DRY_RUN ? '🔍 DRY-RUN — aucune écriture' : '🔧 Correction des noms en cours…')

  // ── 1. 7 Wonders Duel : supprimer le doublon, ajouter Pantheon ─────────────
  {
    const docs = await getGamesByBggId(173346)
    log(`7 Wonders Duel (bgg 173346) : ${docs.length} doc(s) trouvé(s)`)
    if (docs.length > 1) {
      // Garder le premier, supprimer les autres
      for (const doc of docs.slice(1)) {
        log(`  Suppression doublon id=${doc.id}`)
        if (!DRY_RUN) await doc.ref.delete()
      }
    }
    // Vérifier si Pantheon existe déjà
    const pantheonDocs = await getGamesByBggId(202976)
    if (pantheonDocs.length === 0) {
      log(`  Création de "7 Wonders Duel: Pantheon" (bgg 202976)`)
      if (!DRY_RUN) {
        await db.collection('games').add({
          nom: '7 Wonders Duel: Pantheon',
          type: 'extension',
          emplacement: 'A1',
          archived: false,
          bgg_id: 202976,
          image_url: '202976.jpg',
          metadata: {
            nb_joueurs_min: 2, nb_joueurs_max: 2,
            duree_min: 30, duree_max: 30,
            age_min: 10,
            bgg_rating: 7.99434, bgg_weight: 2.31,
            community_best_players: 2, community_min_age: 10,
            bgg_link: 'https://boardgamegeek.com/boardgameexpansion/202976',
            categories: ['Card Game', 'City Building', 'Ancient'],
          },
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        })
      }
    } else {
      log(`  Pantheon déjà présent (${pantheonDocs.length} doc)`)
    }
  }

  // ── 2. Heat : supprimer le doublon, ajouter Tunnel Vision ──────────────────
  {
    // Heat base game (bgg 341169 = Heat: Pedal to the Metal — attention, 157815 = autre jeu "Heat")
    // On cherche par nom "Heat" pour être sûr
    const heatDocs = await getGamesByNom('Heat')
    // Aussi chercher par bgg_id=157815 (le mauvais Heat importé)
    const heat157Docs = await getGamesByBggId(157815)
    log(`Heat (nom="Heat") : ${heatDocs.length} doc(s)`)
    log(`Heat (bgg=157815) : ${heat157Docs.length} doc(s)`)

    // Supprimer les doublons parmi les docs bgg_id=157815
    if (heat157Docs.length > 1) {
      for (const doc of heat157Docs.slice(1)) {
        log(`  Suppression doublon Heat id=${doc.id}`)
        if (!DRY_RUN) await doc.ref.delete()
      }
    }

    // Vérifier si Tunnel Vision existe déjà
    const tvDocs = await getGamesByBggId(436904)
    if (tvDocs.length === 0) {
      log(`  Création de "Heat: Tunnel Vision" (bgg 436904)`)
      if (!DRY_RUN) {
        await db.collection('games').add({
          nom: 'Heat: Tunnel Vision',
          type: 'extension',
          emplacement: 'A1',
          archived: false,
          bgg_id: 436904,
          image_url: '436904.jpg',
          metadata: {
            nb_joueurs_min: 1, nb_joueurs_max: 7,
            duree_min: 30, duree_max: 60,
            age_min: 10,
            bgg_rating: 8.20362, bgg_weight: 2.1538,
            community_best_players: 5, community_min_age: 10,
            bgg_link: 'https://boardgamegeek.com/boardgameexpansion/436904',
            categories: ['Racing'],
          },
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        })
      }
    } else {
      log(`  Tunnel Vision déjà présent (${tvDocs.length} doc)`)
    }
  }

  // ── 3. Défis Nature : renommer les 4 variantes ─────────────────────────────
  {
    const defisDocs = await getGamesByBggId(100670)
    log(`Défis Nature (bgg 100670) : ${defisDocs.length} doc(s)`)

    const defisNames = [
      'Défis Nature : Volcans',
      'Défis Nature : France',
      'Défis Nature : Afrique',
      'Défis Nature : Minéraux',
    ]

    if (defisDocs.length === 4) {
      // Rename each doc in order
      for (let i = 0; i < defisDocs.length; i++) {
        const doc = defisDocs[i]
        const newName = defisNames[i]
        log(`  ${doc.data()['nom']} → "${newName}"`)
        if (!DRY_RUN) await doc.ref.update({ nom: newName, updatedAt: Timestamp.now() })
      }
    } else if (defisDocs.length > 4) {
      log(`  ⚠️  ${defisDocs.length} docs trouvés — supprimer les doublons manuellement`)
    } else {
      log(`  ⚠️  Seulement ${defisDocs.length} docs (attendu 4) — renommage partiel`)
      for (let i = 0; i < defisDocs.length; i++) {
        const doc = defisDocs[i]
        const newName = defisNames[i]
        log(`  ${doc.data()['nom']} → "${newName}"`)
        if (!DRY_RUN) await doc.ref.update({ nom: newName, updatedAt: Timestamp.now() })
      }
    }
  }

  // ── 4. Tam Tam : renommer les 2 entrées ─────────────────────────────────────
  {
    const tamDocs = await getGamesByNom('Tam Tam')
    log(`Tam Tam : ${tamDocs.length} doc(s) trouvé(s)`)

    if (tamDocs.length >= 2) {
      log(`  doc[0] → "Tam Tam Tic Tac"`)
      log(`  doc[1] → "Tam Tam Chrono"`)
      if (!DRY_RUN) {
        await tamDocs[0].ref.update({ nom: 'Tam Tam Tic Tac', updatedAt: Timestamp.now() })
        await tamDocs[1].ref.update({ nom: 'Tam Tam Chrono', updatedAt: Timestamp.now() })
      }
      // Supprimer les éventuels doublons supplémentaires
      for (const doc of tamDocs.slice(2)) {
        log(`  Suppression doublon Tam Tam id=${doc.id}`)
        if (!DRY_RUN) await doc.ref.delete()
      }
    } else if (tamDocs.length === 1) {
      log(`  Seulement 1 doc "Tam Tam" — renommage en "Tam Tam Tic Tac", création de "Tam Tam Chrono"`)
      if (!DRY_RUN) {
        await tamDocs[0].ref.update({ nom: 'Tam Tam Tic Tac', updatedAt: Timestamp.now() })
        await db.collection('games').add({
          nom: 'Tam Tam Chrono',
          type: 'base',
          emplacement: 'A1',
          archived: false,
          metadata: null,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        })
      }
    } else {
      log(`  ⚠️  Aucun doc "Tam Tam" trouvé — création des deux`)
      if (!DRY_RUN) {
        for (const nom of ['Tam Tam Tic Tac', 'Tam Tam Chrono']) {
          await db.collection('games').add({
            nom, type: 'base', emplacement: 'A1', archived: false,
            metadata: null, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
          })
        }
      }
    }
  }

  // ── 5. Jeux sans BGG (notFound + unidentified) ─────────────────────────────
  const noBggEntries = [
    'Gaï-Luron',
    'Smilo Animaux Sauvages',
    'RollCubd Master Chef',
    'Soirée Escape Game : Les 7 Pièces de Cristal',
    'Quiz Années 90',
    'Domino Puzzle Carte de France',
  ]

  for (const nom of noBggEntries) {
    const existing = await db.collection('games').where('nom', '==', nom).limit(1).get()
    if (!existing.empty) {
      log(`  "${nom}" déjà présent`)
      continue
    }
    log(`  Création de "${nom}"`)
    if (!DRY_RUN) {
      await db.collection('games').add({
        nom, type: 'base', emplacement: 'A1', archived: false,
        metadata: null, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      })
    }
  }

  console.log('\n✅ Terminé')
}

main().catch(e => { console.error(e); process.exit(1) })
