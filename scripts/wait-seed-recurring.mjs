import { createServer } from 'node:http'
import { writeFileSync } from 'node:fs'

const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/seed-recurring-done') {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      writeFileSync('seed-recurring-result.json', body || '{}')
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'content-type',
      })
      res.end()
      server.close(() => process.exit(0))
    })
    return
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
    })
    res.end()
    return
  }
  res.writeHead(404)
  res.end()
})

server.listen(8765, '127.0.0.1', () => {
  console.log('waiting for seed-recurring-done')
})

setTimeout(() => {
  console.error('timeout waiting for seed-recurring-done')
  process.exit(1)
}, 120_000)
