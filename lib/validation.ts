import { z } from 'zod'

export const MAX_FILE_SIZE = 20 * 1024 * 1024
export const CHUNK_SIZE = 2 * 1024 * 1024

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number]

export function isAllowedMimeType(value: string): value is AllowedMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(value)
}

export const submissionDetailsSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Enter your full name (at least 2 characters).')
    .max(80, 'Your name must be 80 characters or fewer.')
    .regex(/^[^\u0000-\u001F\u007F]*$/, 'Your name contains invalid characters.'),
  terms: z
    .boolean()
    .refine((value) => value, 'You must accept the competition rules to submit.'),
})

export const fileMetadataSchema = z.object({
  fileName: z.string().trim().min(1, 'Choose your artwork.').max(255, 'The file name is too long.'),
  mimeType: z.enum(ALLOWED_MIME_TYPES, {
    message: 'Choose a JPG, PNG, WEBP, or PDF file.',
  }),
  size: z
    .number()
    .int()
    .positive('Choose your artwork.')
    .max(MAX_FILE_SIZE, 'Your file exceeds the 20 MB limit.'),
})

export const submissionRequestSchema = submissionDetailsSchema.extend({
  file: fileMetadataSchema,
})

export type SubmissionDetails = z.infer<typeof submissionDetailsSchema>
export type FileMetadata = z.infer<typeof fileMetadataSchema>
export type SubmissionRequest = z.infer<typeof submissionRequestSchema>

export function validateArtworkFile(
  file: Pick<File, 'name' | 'type' | 'size'> | null,
): { ok: true } | { ok: false; message: string } {
  if (!file) return { ok: false, message: 'Choose your artwork.' }

  const result = fileMetadataSchema.safeParse({
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
  })

  if (result.success) return { ok: true }

  return {
    ok: false,
    message: result.error.issues[0]?.message ?? 'This file is not supported.',
  }
}
