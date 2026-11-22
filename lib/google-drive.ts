import { z } from 'zod'
import type { AllowedMimeType } from '@/lib/validation'

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'

const FILE_EXTENSIONS: Record<AllowedMimeType, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
}

const driveEnvSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().trim().min(1),
  GOOGLE_CLIENT_SECRET: z.string().trim().min(1),
  GOOGLE_REFRESH_TOKEN: z.string().trim().min(1),
  GOOGLE_DRIVE_FOLDER_ID: z.string().trim().min(1),
})

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.coerce.number().positive().optional(),
})

type DriveConfig = z.infer<typeof driveEnvSchema>

export class DriveError extends Error {
  status: number
  retryable: boolean

  constructor(message: string, status = 502, retryable = false) {
    super(message)
    this.name = 'DriveError'
    this.status = status
    this.retryable = retryable
  }
}

let tokenCache: { accessToken: string; expiresAt: number } | null = null
let verifiedFolderId: string | null = null

function getDriveConfig(): DriveConfig {
  const parsed = driveEnvSchema.safeParse(process.env)
  if (!parsed.success) {
    throw new DriveError(
      'Google Drive is not configured. Add the required environment variables.',
      503,
    )
  }
  return parsed.data
}

async function getAccessToken(config: DriveConfig) {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.accessToken
  }

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      refresh_token: config.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    console.error('[drive] token refresh failed', response.status)
    throw new DriveError('Google Drive authentication failed. Check the OAuth credentials.', 503)
  }

  const data = tokenResponseSchema.safeParse(await response.json())
  if (!data.success) {
    console.error('[drive] invalid token response')
    throw new DriveError('Google Drive returned an invalid authentication response.', 503)
  }

  const expiresIn = data.data.expires_in ?? 3600
  tokenCache = {
    accessToken: data.data.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  }

  return tokenCache.accessToken
}

async function ensureFolderIsAccessible(folderId: string, accessToken: string) {
  if (verifiedFolderId === folderId) return

  const response = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(folderId)}?fields=id,mimeType&supportsAllDrives=true`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    },
  )

  if (!response.ok) {
    console.error('[drive] folder check failed', response.status)
    throw new DriveError(
      'The configured Google Drive folder is not accessible. Check its ID and permissions.',
      503,
    )
  }

  const data = (await response.json().catch(() => null)) as { mimeType?: string } | null
  if (data?.mimeType !== 'application/vnd.google-apps.folder') {
    throw new DriveError('GOOGLE_DRIVE_FOLDER_ID must point to a Google Drive folder.', 503)
  }

  verifiedFolderId = folderId
}

function sanitizeName(value: string) {
  const cleaned = value
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001F\u007F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/, '')
    .slice(0, 80)

  return cleaned || 'Participant'
}

export function buildDriveFileName(fullName: string, mimeType: AllowedMimeType) {
  const date = new Date().toISOString().slice(0, 10)
  return `${sanitizeName(fullName)} - logo - ${date}${FILE_EXTENSIONS[mimeType]}`
}

export async function createResumableUpload(input: {
  fullName: string
  mimeType: AllowedMimeType
  size: number
}) {
  const config = getDriveConfig()
  const accessToken = await getAccessToken(config)
  await ensureFolderIsAccessible(config.GOOGLE_DRIVE_FOLDER_ID, accessToken)

  const driveFileName = buildDriveFileName(input.fullName, input.mimeType)

  const response = await fetch(UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': input.mimeType,
      'X-Upload-Content-Length': String(input.size),
    },
    body: JSON.stringify({
      name: driveFileName,
      mimeType: input.mimeType,
      parents: [config.GOOGLE_DRIVE_FOLDER_ID],
      appProperties: { source: 'cutlass-studio' },
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    console.error('[drive] session creation failed', response.status)
    throw new DriveError('Could not start the Google Drive upload. Please try again.', 502, true)
  }

  const uploadUrl = response.headers.get('location')
  if (!uploadUrl) {
    console.error('[drive] missing upload session URL')
    throw new DriveError('Google Drive did not return an upload session.', 502)
  }

  return { uploadUrl, driveFileName }
}

export type ChunkUploadResult =
  | { done: false; nextOffset: number }
  | { done: true; nextOffset: number; file: { id: string; name?: string } }

export async function uploadDriveChunk(input: {
  uploadUrl: string
  mimeType: AllowedMimeType
  totalSize: number
  offset: number
  chunk: Uint8Array
}): Promise<ChunkUploadResult> {
  const end = input.offset + input.chunk.byteLength
  if (input.chunk.byteLength === 0 || end > input.totalSize) {
    throw new DriveError('Invalid upload chunk.', 400)
  }

  const response = await fetch(input.uploadUrl, {
    method: 'PUT',
    redirect: 'manual',
    headers: {
      'Content-Type': input.mimeType,
      'Content-Range': `bytes ${input.offset}-${end - 1}/${input.totalSize}`,
      'Content-Length': String(input.chunk.byteLength),
    },
    body: input.chunk,
    cache: 'no-store',
  })

  if (response.status === 308) {
    const range = response.headers.get('range')
    const match = range?.match(/bytes=\d+-(\d+)/)
    const nextOffset = match ? Number(match[1]) + 1 : end

    return {
      done: false,
      nextOffset: Number.isFinite(nextOffset) && nextOffset <= input.totalSize ? nextOffset : end,
    }
  }

  if (response.ok) {
    const data = (await response.json().catch(() => null)) as { id?: string; name?: string } | null
    if (!data?.id) {
      console.error('[drive] final upload response missing file id')
      throw new DriveError('Google Drive did not confirm the uploaded file.', 502)
    }
    return { done: true, nextOffset: input.totalSize, file: { id: data.id, name: data.name } }
  }

  if (response.status === 404) {
    throw new DriveError('The upload session expired. Please start the upload again.', 409)
  }

  console.error('[drive] chunk upload failed', response.status)
  throw new DriveError('Google Drive could not complete the upload. Please try again.', 502, true)
}

export function isDriveError(error: unknown): error is DriveError {
  return error instanceof DriveError
}
