import type { AllowedMimeType } from '@/lib/validation'

function matchesAscii(bytes: Uint8Array, offset: number, value: string) {
  if (bytes.length < offset + value.length) return false
  for (let index = 0; index < value.length; index += 1) {
    if (bytes[offset + index] !== value.charCodeAt(index)) return false
  }
  return true
}

export function hasValidFileSignature(mimeType: AllowedMimeType, bytes: Uint8Array) {
  switch (mimeType) {
    case 'image/jpeg':
      return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    case 'image/png':
      return (
        bytes.length >= 8 &&
        bytes[0] === 0x89 &&
        bytes[1] === 0x50 &&
        bytes[2] === 0x4e &&
        bytes[3] === 0x47 &&
        bytes[4] === 0x0d &&
        bytes[5] === 0x0a &&
        bytes[6] === 0x1a &&
        bytes[7] === 0x0a
      )
    case 'image/webp':
      return matchesAscii(bytes, 0, 'RIFF') && matchesAscii(bytes, 8, 'WEBP')
    case 'application/pdf': {
      const limit = Math.min(bytes.length - 5, 1024)
      for (let offset = 0; offset <= limit; offset += 1) {
        if (matchesAscii(bytes, offset, '%PDF-')) return true
      }
      return false
    }
  }
}
