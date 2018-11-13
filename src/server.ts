import 'reflect-metadata'

import * as express    from 'express'
import * as graphql    from 'express-graphql'
import { buildSchema } from 'type-graphql'

import { Database, ChronosResolver } from './db'


// Initialize env, database
const env = process.env.NODE_ENV || 'development'
const db  = new Database()

db.provideToResolver();


(async function() {
  // Construct the schema
  const schema = await buildSchema({
    emitSchemaFile: env == 'development',
    resolvers     : [ChronosResolver],
    validate      : false,
  })

  // Initialize database
  await db.load()

  // Auto-refresh database every day
  setInterval(async () => {
    if (!db.isLoading)
      await db.load()
  }, 3_600_000 * 24)

  // Run server
  const app = express()

  app.use('/', graphql({
    schema,
    graphiql: true
  }))

  app.use('/refresh', async () => {
    if (!db.isLoading)
      await db.load()
  })

  app.listen(process.env.PORT || 443)
})()
