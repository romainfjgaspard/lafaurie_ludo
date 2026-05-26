/**
 * Applique les corrections de name-review.md dans reconciled-games.json.
 * Pour chaque jeu avec une correction non vide, met à jour details.name.
 *
 * Usage : npx tsx scripts/import/applyNameCorrections.ts
 *         npx tsx scripts/import/applyNameCorrections.ts --dry-run
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../')
const REVIEW = path.join(ROOT, 'data/import/name-review.md')
const RECONCILED = path.join(ROOT, 'data/import/reconciled-games.json')

const DRY_RUN = process.argv.includes('--dry-run')

// ── Parseur name-review.md ─────────────────────────────────────────────────

interface Correction {
  num: number
  csvName: string
  bggName: string
  bggId: number
  correction: string
}

function parseCorrections(content: string): Correction[] {
  const corrections: Correction[] = []
  const rowRe = /^\|\s*(\d+)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(\d+)\s*\|\s*(.*?)\s*\|/
  for (const line of content.split('\n')) {
    const m = line.match(rowRe)
    if (!m) continue
    const correction = m[5].trim()
    if (!correction || correction === '___') continue
    corrections.push({
      num: parseInt(m[1]),
      csvName: m[2].replace('⚠️', '').trim(),
      bggName: m[3].trim(),
      bggId: parseInt(m[4]),
      correction,
    })
  }
  return corrections
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  const reviewContent = fs.readFileSync(REVIEW, 'utf-8')
  const corrections = parseCorrections(reviewContent)
  console.log(`📋 ${corrections.length} corrections lues depuis name-review.md`)

  const data = JSON.parse(fs.readFileSync(RECONCILED, 'utf-8'))

  // Index par bggId ET par csvName pour lookup avec fallback
  const allGames = [
    ...(data.confirmed ?? []),
    ...(data.needsReview ?? []),
    ...(data.unidentified ?? []),
  ]
  const byId = new Map<number, any>()
  const byCsvName = new Map<string, any>()
  for (const g of allGames) {
    if (g.selectedBggId) byId.set(g.selectedBggId, g)
    byCsvName.set(g.csvName.toLowerCase().trim(), g)
  }

  let applied = 0
  let notFound = 0

  for (const c of corrections) {
    let game = byId.get(c.bggId)
    if (!game) {
      // Fallback : chercher par csvName (cas où l'ID a été corrigé dans name-review.md)
      game = byCsvName.get(c.csvName.toLowerCase().trim())
      if (game) {
        console.log(`  ℹ️  #${c.num} trouvé par csvName (ID reconciled: ${game.selectedBggId} → name-review: ${c.bggId})`)
        // Mettre à jour l'ID si l'utilisateur l'a corrigé dans name-review.md
        if (!DRY_RUN) game.selectedBggId = c.bggId
      }
    }
    if (!game) {
      console.warn(`  ⚠️  #${c.num} BGG ${c.bggId} "${c.csvName}" → non trouvé dans reconciled-games.json`)
      notFound++
      continue
    }

    const oldName = game.details?.name ?? '(sans détails)'
    if (oldName === c.correction) continue  // déjà correct

    if (DRY_RUN) {
      console.log(`  [DRY] #${c.num} "${oldName}" → "${c.correction}"`)
    } else {
      if (!game.details) game.details = {}
      game.details.name = c.correction
      console.log(`  ✅ #${c.num} "${oldName}" → "${c.correction}"`)
    }
    applied++
  }

  if (!DRY_RUN && applied > 0) {
    fs.writeFileSync(RECONCILED, JSON.stringify(data, null, 2), 'utf-8')
  }

  console.log(`\n${DRY_RUN ? '[DRY-RUN] ' : ''}${applied} noms mis à jour, ${notFound} non trouvés`)
  if (DRY_RUN && applied > 0) {
    console.log('💡 Relancez sans --dry-run pour appliquer.')
  }
}

main()
