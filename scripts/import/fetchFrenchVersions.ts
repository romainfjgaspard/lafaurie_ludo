/**
 * Re-fetche les détails BGG pour tous les jeux de name-review.md afin de récupérer
 * les noms alternatifs (dont les noms français), puis propose des corrections via pickBestName.
 *
 * Usage : npx tsx scripts/import/fetchFrenchVersions.ts
 *         npx tsx scripts/import/fetchFrenchVersions.ts --apply   (met à jour name-review.md)
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import * as dotenv from 'dotenv'
import { fetchDetails, getBggClient, loadCache, saveCache, normalize } from './searchBgg.ts'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../')
const REVIEW = path.join(ROOT, 'data/import/name-review.md')

const APPLY = process.argv.includes('--apply')

// ── Helpers ────────────────────────────────────────────────────────────────

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

// ── Parseur de name-review.md ──────────────────────────────────────────────

interface GameRow {
  num: number
  csvName: string
  bggName: string
  bggId: number
  correction: string
  lineIndex: number
}

function parseNameReview(content: string): GameRow[] {
  const rows: GameRow[] = []
  const lines = content.split('\n')
  const rowRe = /^\|\s*(\d+)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(\d+)\s*\|\s*(.*?)\s*\|/
  lines.forEach((line, idx) => {
    const m = line.match(rowRe)
    if (!m) return
    rows.push({
      num: parseInt(m[1]),
      csvName: m[2].replace('⚠️', '').trim(),
      bggName: m[3].trim(),
      bggId: parseInt(m[4]),
      correction: m[5].trim(),
      lineIndex: idx,
    })
  })
  return rows
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const content = fs.readFileSync(REVIEW, 'utf-8')
  const rows = parseNameReview(content)
  console.log(`📋 ${rows.length} jeux parsés depuis name-review.md`)

  // Jeux sans correction ET avec un vrai ID BGG (pas N/A)
  const toCheck = rows.filter(r => {
    if (!r.bggId || isNaN(r.bggId)) return false
    if (r.bggName === 'N/A') return false
    if (r.correction === '___') return false
    if (r.correction) return false  // correction déjà remplie manuellement
    return true
  })
  console.log(`🔍 ${toCheck.length} jeux à vérifier (correction vide)`)

  const cache = loadCache()
  const client = await getBggClient()
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

  const suggestions: { row: GameRow; bestName: string; score: number }[] = []

  for (let i = 0; i < toCheck.length; i++) {
    const r = toCheck[i]
    const cached = cache.details[r.bggId]

    let details = cached
    // Re-fetch si alternateNames absent du cache
    if (!cached?.alternateNames) {
      process.stdout.write(`  [${i + 1}/${toCheck.length}] BGG ${r.bggId} "${r.csvName}"… `)
      details = await fetchDetails(client, r.bggId) ?? cached
      if (details) {
        cache.details[r.bggId] = details
        console.log(`${details.alternateNames?.length ?? 0} alt. noms`)
      } else {
        console.log('(aucun résultat)')
      }
      if (i < toCheck.length - 1) await sleep(1300)
    }

    if (!details) continue

    const best = pickBestName(r.csvName, details.name, details.alternateNames ?? [])

    if (normalize(best) !== normalize(r.bggName)) {
      const score = similarity(normalize(r.csvName), normalize(best))
      suggestions.push({ row: r, bestName: best, score })
    }
  }

  saveCache(cache)

  // ── Résultats ──────────────────────────────────────────────────────────

  const noSuggestion = toCheck.filter(r =>
    !suggestions.some(s => s.row.num === r.num)
  )

  console.log(`\n📊 Résultats :`)
  console.log(`  Corrections suggérées : ${suggestions.length}`)
  console.log(`  Nom BGG déjà correct  : ${noSuggestion.length}`)

  if (suggestions.length > 0) {
    console.log('\n✏️  Suggestions (BGG primary → meilleur nom) :')
    for (const { row, bestName, score } of suggestions) {
      console.log(
        `  #${String(row.num).padStart(3)} ${row.csvName.padEnd(45)} | "${row.bggName}" → "${bestName}" (score ${score})`
      )
    }
  }

  // ── --apply : met à jour name-review.md ────────────────────────────────

  if (!APPLY) {
    if (suggestions.length > 0) {
      console.log('\n💡 Relancez avec --apply pour écrire les corrections dans name-review.md.')
    }
    return
  }

  if (suggestions.length === 0) {
    console.log('\nℹ️  Aucune correction à appliquer.')
    return
  }

  const lines = content.split('\n')
  let applied = 0

  for (const { row, bestName } of suggestions) {
    const line = lines[row.lineIndex]
    // Remplace uniquement la colonne correction (5e champ du tableau Markdown)
    // Format : | num | csvName ⚠️ | bggName | bggId | correction |
    const parts = line.split('|')
    // parts[0] = '', parts[1] = num, parts[2] = csvName, parts[3] = bggName, parts[4] = bggId, parts[5] = correction, parts[6] = ''
    if (parts.length >= 7) {
      parts[5] = ` ${bestName} `
      lines[row.lineIndex] = parts.join('|')
      applied++
    } else {
      console.warn(`  ⚠️  #${row.num} — format inattendu : ${line}`)
    }
  }

  fs.writeFileSync(REVIEW, lines.join('\n'), 'utf-8')
  console.log(`\n✅ name-review.md mis à jour (${applied} corrections appliquées)`)
}

main().catch(e => { console.error(e); process.exit(1) })
