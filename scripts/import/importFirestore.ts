import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../')
const RECONCILED = path.join(ROOT, 'data/import/reconciled-games.json')
const DRY_RUN = process.argv.includes('--dry-run')
const UPSERT = process.argv.includes('--upsert')

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
  : JSON.parse(fs.readFileSync(path.join(ROOT, 'service-account.json'), 'utf-8'))

initializeApp({ credential: cert(serviceAccount) })
const db = getFirestore()
db.settings({ ignoreUndefinedProperties: true })

async function upsertOrAdd(displayName: string, csvName: string, doc: Record<string, unknown>) {
  if (UPSERT) {
    // Try to find by nom (display name) first, then by csvName
    let snapshot = await db.collection('games').where('nom', '==', displayName).limit(1).get()
    if (snapshot.empty) {
      snapshot = await db.collection('games').where('nom', '==', csvName).limit(1).get()
    }
    if (!snapshot.empty) {
      await snapshot.docs[0].ref.update({ ...doc, updatedAt: Timestamp.now() })
      console.log(`🔄 ${displayName} (mis à jour)`)
    } else {
      await db.collection('games').add(doc)
      console.log(`✅ ${displayName} (créé)`)
    }
  } else {
    await db.collection('games').add(doc)
    console.log(`✅ ${displayName}`)
  }
}

async function main() {
  console.log(DRY_RUN ? '🔍 Mode DRY-RUN (aucune écriture)' : '🚀 Import Firestore en cours…')

  const data = JSON.parse(fs.readFileSync(RECONCILED, 'utf-8'))

  // ── Jeux avec correspondance BGG ──────────────────────────────────────────
  const bggGames = [...data.confirmed, ...(data.needsReview ?? [])].filter((g: any) => g.selectedBggId && g.details)
  let count = 0

  for (const game of bggGames) {
    const d = game.details
    const displayName: string = game.nomOverride ?? d.name ?? game.csvName
    const doc = {
      nom: displayName,
      type: d.type === 'boardgameexpansion' ? 'extension' : 'base',
      emplacement: 'A1',
      archived: false,
      bgg_id: d.id,
      image_url: `${d.id}.jpg`,
      metadata: {
        nb_joueurs_min: d.minPlayers ?? 2,
        nb_joueurs_max: d.maxPlayers ?? 4,
        duree_min: d.minPlaytime ?? 30,
        duree_max: d.maxPlaytime ?? 60,
        age_min: d.minAge ?? 8,
        bgg_rating: d.bggRating,
        bgg_weight: d.bggWeight,
        community_best_players: d.communityBestPlayers,
        community_min_age: d.communityMinAge,
        bgg_link: d.bggLink ?? (d.id ? `https://boardgamegeek.com/boardgame/${d.id}` : undefined),
        categories: d.categories?.length ? d.categories : undefined,
      },
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }

    if (DRY_RUN) {
      console.log(`[DRY-BGG] ${game.csvName} → "${displayName}", bgg:${d.id}, type:${doc.type}`)
    } else {
      await upsertOrAdd(displayName, game.csvName, doc)
    }
    count++
  }

  // ── Jeux sans correspondance BGG ──────────────────────────────────────────
  const noBggGames: any[] = data.noBgg ?? []

  for (const game of noBggGames) {
    const displayName: string = game.nomOverride ?? game.csvName
    const doc = {
      nom: displayName,
      type: 'base',
      emplacement: 'A1',
      archived: false,
      metadata: null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    }

    if (DRY_RUN) {
      console.log(`[DRY-NOBGG] "${displayName}"`)
    } else {
      await upsertOrAdd(displayName, game.csvName, doc)
    }
    count++
  }

  console.log(`\n${DRY_RUN ? '(DRY-RUN)' : ''} ${count} jeux traités (${bggGames.length} BGG + ${noBggGames.length} sans BGG)`)
}

main().catch(e => { console.error(e); process.exit(1) })
