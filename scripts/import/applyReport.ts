import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import * as dotenv from 'dotenv'
import { fetchDetails, getBggClient, loadCache, saveCache, normalize } from './searchBgg.ts'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../')
const REPORT = path.join(ROOT, 'data/import/review-report.md')
const RECONCILED = path.join(ROOT, 'data/import/reconciled-games.json')

function similarity(a: string, b: string): number {
  if (a === b) return 100
  if (b.includes(a) || a.includes(b)) return 90
  const la = a.length, lb = b.length
  const dp = Array.from({ length: la + 1 }, (_, i) =>
    Array(lb + 1).fill(0).map((_, j) => i === 0 ? j : j === 0 ? i : 0)
  )
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return Math.round((1 - dp[la][lb] / Math.max(la, lb)) * 100)
}

/** Parmi primaryName + alternates, retourne le nom le plus proche du nom CSV (= le nom français probable) */
function pickBestName(csvName: string, primaryName: string, alternates: string[]): string {
  const allNames = [primaryName, ...alternates]
  const normCsv = normalize(csvName)
  let best = primaryName
  let bestScore = -1
  for (const n of allNames) {
    const s = similarity(normCsv, normalize(n))
    if (s > bestScore) { bestScore = s; best = n }
  }
  return best
}

async function main() {
  const report = fs.readFileSync(REPORT, 'utf-8')
  const data = JSON.parse(fs.readFileSync(RECONCILED, 'utf-8'))

  if (!data.unidentified) data.unidentified = []

  // --- 1. Parser le rapport ---

  // needsReview : ### Nom\n- selectedBggId: <id|aucun>
  // Utilise une file pour gérer les doublons (ex: TTMC 2)
  const selectionsQueue: Record<string, (number | 'aucun')[]> = {}
  // notFound : - **Nom** -> selectedBggId: <id>
  const notFoundSelections: Record<string, number> = {}

  let currentName: string | null = null
  let inNotFoundSection = false

  for (const line of report.split('\n')) {
    if (line.startsWith('## Jeux non trouvés')) { inNotFoundSection = true; continue }
    if (line.startsWith('## ') && !line.includes('non trouvés')) { inNotFoundSection = false }

    if (!inNotFoundSection) {
      const nameMatch = line.match(/^### (.+)$/)
      if (nameMatch) { currentName = nameMatch[1].trim(); continue }

      if (currentName) {
        const idMatch = line.match(/^- selectedBggId:\s*(\d+)/)
        if (idMatch) {
          if (!selectionsQueue[currentName]) selectionsQueue[currentName] = []
          selectionsQueue[currentName].push(parseInt(idMatch[1]))
          continue
        }
        const aucunMatch = line.match(/^- selectedBggId:\s*aucun/i)
        if (aucunMatch) {
          if (!selectionsQueue[currentName]) selectionsQueue[currentName] = []
          selectionsQueue[currentName].push('aucun')
        }
      }
    } else {
      // - **misitigri mon premier jeu** -> selectedBggId: 230910
      const nfMatch = line.match(/^- \*\*(.+?)\*\*\s*->\s*selectedBggId:\s*(\d+)/)
      if (nfMatch) notFoundSelections[nfMatch[1].trim()] = parseInt(nfMatch[2])
    }
  }

  // --- 2. Appliquer les sélections needsReview ---

  const stillNeedsReview: any[] = []
  const newlyConfirmed: any[] = []
  const newlyUnidentified: any[] = []

  for (const game of data.needsReview) {
    const queue = selectionsQueue[game.csvName]
    if (!queue || queue.length === 0) {
      stillNeedsReview.push(game)
      continue
    }
    const selection = queue.shift()!
    if (selection === 'aucun') {
      game.selectedBggId = null
      game.status = 'unidentified'
      newlyUnidentified.push(game)
      console.log(`⏭️  ${game.csvName} → non identifié (admin requis)`)
    } else {
      game.selectedBggId = selection
      game.status = 'confirmed'
      newlyConfirmed.push(game)
      console.log(`✅ ${game.csvName} → BGG #${selection}`)
    }
  }

  // --- 3. Appliquer les sélections notFound ---

  const stillNotFound: any[] = []
  for (const game of data.notFound) {
    const id = notFoundSelections[game.csvName]
    if (id) {
      game.selectedBggId = id
      game.status = 'confirmed'
      newlyConfirmed.push(game)
      console.log(`✅ ${game.csvName} → BGG #${id}`)
    } else {
      stillNotFound.push(game)
    }
  }

  // --- 4. Mettre à jour les tableaux ---

  data.needsReview = stillNeedsReview
  data.notFound = stillNotFound
  data.confirmed.push(...newlyConfirmed)
  data.unidentified.push(...newlyUnidentified)

  console.log(`\n📊 Après application du rapport :`)
  console.log(`  Confirmés     : ${data.confirmed.length}`)
  console.log(`  Non identifiés: ${data.unidentified.length}`)
  console.log(`  À réviser     : ${data.needsReview.length}`)
  console.log(`  Non trouvés   : ${data.notFound.length}`)

  // --- 5. Fetcher les détails BGG manquants et choisir le meilleur nom ---

  const cache = loadCache()
  const client = await getBggClient()
  let fetched = 0

  for (const game of newlyConfirmed) {
    if (!game.selectedBggId) continue

    // Si les détails en place correspondent déjà au bon ID, conserver
    if (game.details?.id === game.selectedBggId) {
      // Améliorer le nom si on a des alternates en cache
      const cached = cache.details[game.selectedBggId]
      if (cached?.alternateNames) {
        game.details.name = pickBestName(game.csvName, cached.name, cached.alternateNames)
      }
      continue
    }

    // Chercher dans le cache
    if (cache.details[game.selectedBggId]) {
      const d = cache.details[game.selectedBggId]
      d.name = pickBestName(game.csvName, d.name, d.alternateNames ?? [])
      game.details = d
      continue
    }

    // Fetch BGG
    console.log(`  🌐 Fetch BGG ${game.selectedBggId} pour "${game.csvName}"…`)
    const details = await fetchDetails(client, game.selectedBggId)
    if (details) {
      details.name = pickBestName(game.csvName, details.name, details.alternateNames ?? [])
      cache.details[game.selectedBggId] = details
      game.details = details
      fetched++
    } else {
      console.warn(`  ⚠️  Aucun détail BGG pour ${game.selectedBggId}`)
    }
  }

  saveCache(cache)
  fs.writeFileSync(RECONCILED, JSON.stringify(data, null, 2), 'utf-8')

  console.log(`\n✅ ${fetched} nouvelles fiches BGG fetchées`)
  console.log(`✅ reconciled-games.json mis à jour`)
  if (data.unidentified.length > 0) {
    console.log(`\n⚠️  ${data.unidentified.length} jeux non identifiés (saisie admin requise) :`)
    for (const g of data.unidentified) console.log(`    - ${g.csvName}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
