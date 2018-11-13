require('ts-node/register/transpile-only')

// Ignore unhandled rejections, since nothing else works
process.on('unhandledRejection', _ => {
  console.error('Unhandled rejection encountered...')
})

// Load server
require('./src/server.ts')
