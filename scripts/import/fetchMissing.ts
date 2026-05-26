import * as fs from 'fs'
import * as dotenv from 'dotenv'
import { fetchDetails, getBggClient, loadCache, saveCache } from './searchBgg.ts'

dotenv.config({ path: '.env.local' })

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

async function main() {
  const data = JSON.parse(fs.readFileSync('data/import/reconciled-games.json', 'utf-8'))
  const cache = loadCache()

  const all = [...(data.confirmed || []), ...(data.unidentified || [])]
  const missingIds: number[] = [...new Set<number>(
    all
      .filter((g: any) => g.selectedBggId && !cache.details[g.selectedBggId])
      .map((g: any) => g.selectedBggId as number)
  )]

  console.log(`🔍 ${missingIds.length} IDs à fetcher`)

  const client = await getBggClient()
  let done = 0
  for (const id of missingIds) {
    const game: any = all.find((g: any) => g.selectedBggId === id)
    process.stdout.write(`  [${++done}/${missingIds.length}] BGG ${id} "${game?.csvName}"… `)
    const details = await fetchDetails(client, id)
    if (details) { cache.details[id] = details; console.log(`✅ ${details.name}`) }
    else console.log('(aucun résultat)')
    if (done < missingIds.length) await sleep(1500)
  }

  saveCache(cache)
  console.log(`\n✅ ${done} détails fetchés`)
}

main().catch(e => { console.error(e); process.exit(1) })
