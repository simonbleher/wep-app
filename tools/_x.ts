import { readFileSync, writeFileSync } from 'node:fs'
import JSZip from 'jszip'
import { exportWep } from '../src/export'
import { bauFuerExport } from '../src/app/bauHelfer'
import { sharedStrings, zellenWert, blattPfadNachName } from '../src/export/bauExcelLesen'
const z = await JSZip.loadAsync(readFileSync('/tmp/wepx/a.zip'))
const wep = JSON.parse(await z.file('wep.json')!.async('string')).wep
const bytes = await z.file('bau.xlsx')!.async('arraybuffer')
const w = bauFuerExport(wep)
const r = await exportWep(w, bytes, { teil: wep.rolle, formalienAbgeglichen: true })
const buf = await r.blob.arrayBuffer()
writeFileSync('/tmp/wepx/export2.xlsx', Buffer.from(buf))
const zz = await JSZip.loadAsync(buf)
const g = await sharedStrings(zz)
const xml = await zz.file(await blattPfadNachName(zz, 'Baulichkeiten', 'xl/worksheets/sheet3.xml'))!.async('string')
for (const c of ['B12','G12','C13','D13','I13','E14','A17','B21','G21','A26','B47','G47','A52','H7','I7']) console.log(c, JSON.stringify(zellenWert(xml, c, g)), (new RegExp(`<c r="${c}"[^>]*?(/>|>[\\s\\S]*?</c>)`).exec(xml)?.[0] ?? '').slice(0, 160))
console.log(JSON.stringify(r.bau))
