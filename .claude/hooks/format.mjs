// PostToolUse hook: run Prettier on the file Claude just wrote/edited.
// Reads the hook JSON payload on stdin; stays silent and never fails the tool call.
import { spawnSync } from 'node:child_process'

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (d) => (raw += d))
process.stdin.on('end', () => {
  let file
  try {
    const payload = JSON.parse(raw)
    file = payload?.tool_response?.filePath || payload?.tool_input?.file_path
  } catch {
    return
  }
  if (!file) return

  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
  spawnSync(npx, ['prettier', '--write', '--ignore-unknown', file], {
    stdio: 'ignore',
    shell: process.platform === 'win32'
  })
})
