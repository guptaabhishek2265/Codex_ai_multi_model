import { readdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const ignore = new Set(['node_modules', '.git', 'private', 'dist', 'temp', 'generated-images', '__pycache__'])
const walk = async directory => {
    const result = []
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (ignore.has(entry.name)) continue
        const filename = path.join(directory, entry.name)
        if (entry.isDirectory()) result.push(...await walk(filename))
        else result.push(filename)
    }
    return result
}
const files = [...await walk(path.join(root, 'backend')), ...await walk(path.join(root, 'deployment'))]
const run = args => {
    const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' })
    if (result.status !== 0) process.exit(result.status || 1)
}
for (const file of files.filter(file => /\.(js|mjs)$/.test(file))) run(['--check', file])
run(['--test', ...files.filter(file => file.endsWith('.test.js') || file.endsWith('.test.mjs'))])
console.log('Backend/deployment syntax and regression checks passed.')
