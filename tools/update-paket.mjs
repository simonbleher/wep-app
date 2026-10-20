// Erzeugt nach dem Web-Build das Live-Update-Paket der Android-App:
// dist/updates/<commit>.zip = Inhalt von dist/ (index.html liegt an der Wurzel des Zips).
// Ohne bekannten Commit (lokaler Build) entsteht kein Paket; version.json hat dann auch keine
// bundleUrl. Aufruf: node tools/update-paket.mjs [dist-Ordner]
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import JSZip from 'jszip'

const dist = process.argv[2] ?? 'dist'

async function dateien(ordner) {
  const liste = []
  for (const eintrag of await readdir(ordner, { withFileTypes: true })) {
    const pfad = join(ordner, eintrag.name)
    if (eintrag.isDirectory()) liste.push(...(await dateien(pfad)))
    else liste.push(pfad)
  }
  return liste
}

const version = JSON.parse(await readFile(join(dist, 'version.json'), 'utf-8'))
if (!version.commit || !version.bundleUrl) {
  console.log('update-paket: kein Commit bekannt – kein Live-Update-Paket.')
  process.exit(0)
}

const zip = new JSZip()
for (const datei of await dateien(dist)) {
  const name = relative(dist, datei).split(sep).join('/')
  if (name.startsWith('updates/')) continue
  zip.file(name, await readFile(datei), { createFolders: false })
}
const inhalt = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } })
await mkdir(join(dist, 'updates'), { recursive: true })
const ziel = join(dist, 'updates', `${version.commit}.zip`)
await writeFile(ziel, inhalt)
console.log(`update-paket: ${ziel} (${((await stat(ziel)).size / 1024 / 1024).toFixed(1)} MB)`)
