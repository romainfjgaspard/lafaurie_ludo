import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
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

async function main() {
  console.log(DRY_RUN ? '🔍 Mode DRY-RUN — aucune suppression' : '🗑️  Suppression de la collection games…')

  const snapshot = await db.collection('games').get()
  console.log(`${snapshot.size} documents trouvés dans la collection games`)

  if (DRY_RUN) {
    snapshot.docs.slice(0, 5).forEach(doc => console.log(`  - ${doc.id}: ${doc.data().name ?? '(sans nom)'}`))
    if (snapshot.size > 5) console.log(`  … et ${snapshot.size - 5} autres`)
    console.log('✅ Dry-run terminé — relancer sans --dry-run pour supprimer')
    return
  }

  // Suppression par batches de 500 (limite Firestore)
  const BATCH_SIZE = 500
  let deleted = 0
  const docs = snapshot.docs

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = db.batch()
    docs.slice(i, i + BATCH_SIZE).forEach(doc => batch.delete(doc.ref))
    await batch.commit()
    deleted += Math.min(BATCH_SIZE, docs.length - i)
    console.log(`  ${deleted}/${docs.length} supprimés…`)
  }

  console.log(`✅ ${deleted} documents supprimés`)
}

main().catch(e => { console.error(e); process.exit(1) })
