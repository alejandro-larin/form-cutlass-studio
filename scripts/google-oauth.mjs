import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

const PORT = 53682
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`
const SCOPE = 'https://www.googleapis.com/auth/drive'

function parseEnvFile(contents) {
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match) continue
    let value = match[2].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[match[1]] === undefined) process.env[match[1]] = value
  }
}

for (const file of ['.env.local', '.env']) {
  try {
    parseEnvFile(await readFile(file, 'utf8'))
  } catch {
    // Env files are optional when the variables are already exported.
  }
}

const clientId = process.env.GOOGLE_CLIENT_ID
const clientSecret = process.env.GOOGLE_CLIENT_SECRET

if (!clientId || !clientSecret) {
  console.error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET.')
  console.error('Add both to .env (or .env.local) before running pnpm google:auth.')
  process.exit(1)
}

const state = randomUUID()
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: REDIRECT_URI,
  response_type: 'code',
  scope: SCOPE,
  access_type: 'offline',
  prompt: 'consent',
  include_granted_scopes: 'true',
  state,
}).toString()

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', REDIRECT_URI)

  if (url.pathname !== '/oauth2callback') {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Not found.')
    return
  }

  if (url.searchParams.get('error')) {
    response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end('<h1>Authorization cancelled.</h1><p>You can close this tab.</p>')
    console.error('Authorization error:', url.searchParams.get('error'))
    server.close()
    return
  }

  if (url.searchParams.get('state') !== state) {
    response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end('<h1>Invalid OAuth state.</h1><p>Please run the command again.</p>')
    server.close()
    return
  }

  const code = url.searchParams.get('code')
  if (!code) {
    response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end('<h1>Missing authorization code.</h1>')
    server.close()
    return
  }

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI,
      }),
    })

    const data = await tokenResponse.json()

    if (!tokenResponse.ok) {
      throw new Error(data.error_description ?? data.error ?? 'Token exchange failed.')
    }

    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end('<h1>Google Drive connected.</h1><p>You can close this tab and return to the terminal.</p>')

    console.log('\nAdd this line to .env (or .env.local) and to your Vercel environment variables:\n')
    if (data.refresh_token) {
      console.log(`GOOGLE_REFRESH_TOKEN=${data.refresh_token}\n`)
    } else {
      console.error('Google did not return a refresh token.')
      console.error('Revoke the app access and run the command again.')
    }
  } catch (error) {
    response.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end('<h1>Token exchange failed.</h1><p>Check the terminal for details.</p>')
    console.error(error)
  } finally {
    server.close()
  }
})

server.listen(PORT, () => {
  console.log('Google Drive OAuth setup')
  console.log(`Redirect URI: ${REDIRECT_URI}`)
  console.log(`\nOpen this URL in your browser:\n\n${authUrl}\n`)
})

server.on('error', (error) => {
  console.error(`Could not start the local callback server on port ${PORT}.`)
  console.error(error)
  process.exit(1)
})
