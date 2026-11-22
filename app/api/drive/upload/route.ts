import { NextResponse, type NextRequest } from 'next/server'
import { hasValidFileSignature } from '@/lib/file-signature'
import { isDriveError, uploadDriveChunk } from '@/lib/google-drive'
import { isSameOriginRequest } from '@/lib/request-origin'
import { clearUploadSessionCookie, readUploadSession } from '@/lib/upload-session'
import { CHUNK_SIZE } from '@/lib/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CHUNK_ALIGNMENT = 256 * 1024

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 })
  }

  const session = readUploadSession(request)
  if (!session) {
    return NextResponse.json(
      { error: 'Your upload session expired. Please start the upload again.' },
      { status: 409 },
    )
  }

  const offset = Number(request.headers.get('x-upload-offset'))
  if (!Number.isInteger(offset) || offset < 0 || offset >= session.size) {
    return NextResponse.json({ error: 'Invalid upload offset.' }, { status: 400 })
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > CHUNK_SIZE) {
    return NextResponse.json({ error: 'Upload chunk is too large.' }, { status: 413 })
  }

  const chunk = new Uint8Array(await request.arrayBuffer())
  if (chunk.byteLength === 0) {
    return NextResponse.json({ error: 'The upload chunk is empty.' }, { status: 400 })
  }
  if (chunk.byteLength > CHUNK_SIZE) {
    return NextResponse.json({ error: 'Upload chunk is too large.' }, { status: 413 })
  }
  if (offset + chunk.byteLength > session.size) {
    return NextResponse.json({ error: 'The upload chunk exceeds the file size.' }, { status: 400 })
  }

  const isFinalChunk = offset + chunk.byteLength === session.size
  if (!isFinalChunk && chunk.byteLength % CHUNK_ALIGNMENT !== 0) {
    return NextResponse.json({ error: 'Invalid upload chunk size.' }, { status: 400 })
  }

  if (offset === 0 && !hasValidFileSignature(session.mimeType, chunk)) {
    const response = NextResponse.json(
      { error: 'The file content does not match its declared type.' },
      { status: 400 },
    )
    clearUploadSessionCookie(response)
    return response
  }

  try {
    const result = await uploadDriveChunk({
      uploadUrl: session.url,
      mimeType: session.mimeType,
      totalSize: session.size,
      offset,
      chunk,
    })

    const response = NextResponse.json(result)
    if (result.done) clearUploadSessionCookie(response)
    return response
  } catch (error) {
    if (isDriveError(error)) {
      const response = NextResponse.json(
        { error: error.message, retryable: error.retryable },
        { status: error.status },
      )
      if (error.status === 409) clearUploadSessionCookie(response)
      return response
    }

    console.error('[drive/upload] unexpected error', error)
    return NextResponse.json(
      { error: 'Could not upload the artwork. Please try again.' },
      { status: 500 },
    )
  }
}
