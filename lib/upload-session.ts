import type { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ALLOWED_MIME_TYPES } from '@/lib/validation'

const COOKIE_NAME = 'cutlass_drive_upload'
const COOKIE_MAX_AGE = 60 * 60

const uploadSessionSchema = z.object({
  url: z
    .string()
    .url()
    .refine((value) => {
      const url = new URL(value)
      return (
        url.protocol === 'https:' &&
        (url.hostname === 'www.googleapis.com' || url.hostname === 'content.googleapis.com')
      )
    }, 'Invalid upload session URL.'),
  size: z.number().int().positive(),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  driveFileName: z.string().min(1),
  createdAt: z.number().int().positive(),
})

export type UploadSession = z.infer<typeof uploadSessionSchema>

function encodeSession(session: UploadSession) {
  return Buffer.from(JSON.stringify(session), 'utf8').toString('base64url')
}

function decodeSession(value: string): UploadSession | null {
  try {
    const parsed = uploadSessionSchema.safeParse(
      JSON.parse(Buffer.from(value, 'base64url').toString('utf8')),
    )
    if (!parsed.success) return null
    if (Date.now() - parsed.data.createdAt > COOKIE_MAX_AGE * 1000) return null
    return parsed.data
  } catch {
    return null
  }
}

export function readUploadSession(request: NextRequest): UploadSession | null {
  const value = request.cookies.get(COOKIE_NAME)?.value
  if (!value) return null
  return decodeSession(value)
}

export function setUploadSessionCookie(response: NextResponse, session: UploadSession) {
  response.cookies.set({
    name: COOKIE_NAME,
    value: encodeSession(session),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/drive',
    maxAge: COOKIE_MAX_AGE,
  })
}

export function clearUploadSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/drive',
    maxAge: 0,
  })
}
