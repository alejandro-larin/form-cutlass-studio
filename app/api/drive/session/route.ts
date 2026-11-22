import { NextResponse, type NextRequest } from 'next/server'
import { createResumableUpload, isDriveError } from '@/lib/google-drive'
import { isSameOriginRequest } from '@/lib/request-origin'
import { setUploadSessionCookie } from '@/lib/upload-session'
import { CHUNK_SIZE, submissionRequestSchema } from '@/lib/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > 10_000) {
    return NextResponse.json({ error: 'Request is too large.' }, { status: 413 })
  }

  const payload = await request.json().catch(() => null)
  if (!payload) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const parsed = submissionRequestSchema.safeParse(payload)
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Please check your details and artwork, then try again.',
        fields: parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        })),
      },
      { status: 422 },
    )
  }

  try {
    const session = await createResumableUpload({
      fullName: parsed.data.fullName,
      mimeType: parsed.data.file.mimeType,
      size: parsed.data.file.size,
    })

    const response = NextResponse.json({
      ok: true,
      chunkSize: CHUNK_SIZE,
      fileName: session.driveFileName,
    })

    setUploadSessionCookie(response, {
      url: session.uploadUrl,
      size: parsed.data.file.size,
      mimeType: parsed.data.file.mimeType,
      driveFileName: session.driveFileName,
      createdAt: Date.now(),
    })

    return response
  } catch (error) {
    if (isDriveError(error)) {
      return NextResponse.json(
        { error: error.message, retryable: error.retryable },
        { status: error.status },
      )
    }

    console.error('[drive/session] unexpected error', error)
    return NextResponse.json(
      { error: 'Could not start the upload. Please try again.' },
      { status: 500 },
    )
  }
}
