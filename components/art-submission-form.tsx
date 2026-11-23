'use client'

import { useRef, useState } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { ArrowUpRight, Check, FileImage, ImagePlus, Sparkles, Upload, X } from 'lucide-react'
import { submissionDetailsSchema, validateArtworkFile } from '@/lib/validation'

const PANEL_COUNT = 4
const HORIZONTAL_QUERY = '(min-width: 768px) and (min-height: 560px) and (prefers-reduced-motion: no-preference)'
const MOBILE_QUERY = '(max-width: 767px) and (prefers-reduced-motion: no-preference)'
const DEFAULT_CHUNK_SIZE = 2 * 1024 * 1024

type ChunkResponse = {
  done: boolean
  nextOffset: number
  file?: { id: string; name?: string }
  error?: string
  retryable?: boolean
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function uploadChunkWithRetry(offset: number, chunk: Blob): Promise<ChunkResponse> {
  let lastError: unknown = new Error('Could not upload the artwork. Please try again.')

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response: Response
    try {
      response = await fetch('/api/drive/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Upload-Offset': String(offset),
        },
        body: chunk,
      })
    } catch (error) {
      lastError = error
      if (attempt < 2) await sleep(600 * (attempt + 1))
      continue
    }

    const data = (await response.json().catch(() => null)) as ChunkResponse | null

    if (response.ok && data) return data

    lastError = new Error(data?.error ?? 'Could not upload the artwork. Please try again.')
    if (response.status < 500) throw lastError
    if (attempt < 2) await sleep(600 * (attempt + 1))
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Could not upload the artwork. Please try again.')
}

export function ArtSubmissionForm() {
  const [file, setFile] = useState<File | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [fileError, setFileError] = useState('')
  const [nameError, setNameError] = useState('')
  const [termsError, setTermsError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const submittingRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const shellRef = useRef<HTMLElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLSpanElement>(null)
  const counterRef = useRef<HTMLSpanElement>(null)
  const triggerRef = useRef<ScrollTrigger | null>(null)
  const artworkRef = useRef<HTMLDivElement>(null)

  function selectFile(candidate?: File) {
    setFileError('')
    setSubmitError('')

    if (!candidate) {
      setFile(null)
      return
    }

    const validation = validateArtworkFile(candidate)
    if (!validation.ok) {
      setFile(null)
      setFileError(validation.message)
      if (inputRef.current) inputRef.current.value = ''
      return
    }

    setFile(candidate)
  }

  function resetForm() {
    setSubmitted(false)
    setFile(null)
    setFileError('')
    setNameError('')
    setTermsError('')
    setSubmitError('')
    setUploadProgress(0)
    submittingRef.current = false
    setSubmitting(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submittingRef.current) return

    setSubmitError('')
    setNameError('')
    setTermsError('')
    setFileError('')

    const form = event.currentTarget
    const formData = new FormData(form)
    const details = submissionDetailsSchema.safeParse({
      fullName: String(formData.get('fullName') ?? ''),
      terms: formData.get('terms') === 'on',
    })

    let nameIssue = false
    let termsIssue = false
    if (!details.success) {
      for (const issue of details.error.issues) {
        if (issue.path[0] === 'fullName') {
          setNameError(issue.message)
          nameIssue = true
        }
        if (issue.path[0] === 'terms') {
          setTermsError(issue.message)
          termsIssue = true
        }
      }
    }

    const fileValidation = validateArtworkFile(file)
    if (!fileValidation.ok) setFileError(fileValidation.message)

    if (nameIssue || termsIssue || !fileValidation.ok) {
      if (nameIssue) document.getElementById('fullName')?.focus()
      else if (!fileValidation.ok) inputRef.current?.focus()
      else if (termsIssue) document.getElementById('terms')?.focus()
      return
    }

    const selectedFile = file
    if (!selectedFile) return

    submittingRef.current = true
    setSubmitting(true)
    setUploadProgress(0)

    try {
      const sessionResponse = await fetch('/api/drive/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: details.success ? details.data.fullName : '',
          terms: true,
          file: {
            fileName: selectedFile.name,
            mimeType: selectedFile.type,
            size: selectedFile.size,
          },
        }),
      })

      const sessionData = (await sessionResponse.json().catch(() => null)) as
        | { chunkSize?: number; error?: string }
        | null

      if (!sessionResponse.ok) {
        throw new Error(sessionData?.error ?? 'Could not start the upload. Please try again.')
      }

      const chunkSize =
        typeof sessionData?.chunkSize === 'number' && sessionData.chunkSize > 0
          ? sessionData.chunkSize
          : DEFAULT_CHUNK_SIZE

      let offset = 0
      while (offset < selectedFile.size) {
        const end = Math.min(offset + chunkSize, selectedFile.size)
        const chunk = selectedFile.slice(offset, end)
        const result = await uploadChunkWithRetry(offset, chunk)
        const nextOffset = result.done ? selectedFile.size : result.nextOffset

        if (
          !Number.isInteger(nextOffset) ||
          nextOffset <= offset ||
          nextOffset > selectedFile.size
        ) {
          throw new Error('The upload response was invalid. Please try again.')
        }

        offset = nextOffset
        setUploadProgress(Math.min(100, Math.round((offset / selectedFile.size) * 100)))
      }

      setUploadProgress(100)
      setSubmitted(true)
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : 'Could not upload the artwork. Please try again.',
      )
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  function scrollToPanel(id: string) {
    const panel = document.getElementById(id)
    if (!panel) return

    const track = trackRef.current
    const trigger = triggerRef.current

    if (track && trigger) {
      const distance = Math.max(0, track.scrollWidth - window.innerWidth)
      const offset = panel.getBoundingClientRect().left - track.getBoundingClientRect().left
      const ratio = distance > 0 ? Math.min(Math.max(offset / distance, 0), 1) : 0
      const top = trigger.start + ratio * (trigger.end - trigger.start)
      window.scrollTo({ top, behavior: 'smooth' })
      return
    }

    panel.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleAnchorClick(id: string) {
    return (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault()
      scrollToPanel(id)
    }
  }

  function handleArtworkPointer(event: React.PointerEvent<HTMLDivElement>) {
    const artwork = artworkRef.current
    if (!artwork) return
    const rect = artwork.getBoundingClientRect()
    artwork.style.setProperty('--glow-x', `${event.clientX - rect.left}px`)
    artwork.style.setProperty('--glow-y', `${event.clientY - rect.top}px`)
    artwork.classList.add('is-touching')
  }

  function handleArtworkEnd() {
    artworkRef.current?.classList.remove('is-touching')
  }

  useGSAP(
    () => {
      const viewport = viewportRef.current
      const track = trackRef.current
      if (!viewport || !track) return

      gsap.registerPlugin(ScrollTrigger)
      document.fonts?.ready.then(() => ScrollTrigger.refresh()).catch(() => {})

      const mm = gsap.matchMedia()

      mm.add(HORIZONTAL_QUERY, () => {
        const getDistance = () => Math.max(0, track.scrollWidth - window.innerWidth)

        const horizontal = gsap.to(track, {
          x: () => -getDistance(),
          ease: 'none',
          scrollTrigger: {
            trigger: viewport,
            start: 'top top',
            end: () => `+=${getDistance()}`,
            pin: true,
            scrub: 1,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              if (progressRef.current) {
                progressRef.current.style.transform = `scaleX(${self.progress})`
              }
              if (counterRef.current) {
                const current = Math.min(PANEL_COUNT, Math.floor(self.progress * PANEL_COUNT) + 1)
                counterRef.current.textContent = `${String(current).padStart(2, '0')} / ${String(PANEL_COUNT).padStart(2, '0')}`
              }
            },
          },
        })

        triggerRef.current = horizontal.scrollTrigger ?? null

        const panels = gsap.utils.toArray<HTMLElement>('[data-panel]', shellRef.current)
        const restPanels = panels.slice(1)

        restPanels.forEach((panel) => {
          const reveals = panel.querySelectorAll<HTMLElement>('[data-reveal]')
          if (!reveals.length) return

          gsap.from(reveals, {
            x: 70,
            opacity: 0,
            duration: 0.85,
            stagger: 0.07,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: panel,
              containerAnimation: horizontal,
              start: 'left 88%',
              end: 'left 45%',
              toggleActions: 'play none none reverse',
            },
          })
        })

        const parallaxLayers = gsap.utils.toArray<HTMLElement>('[data-parallax]', shellRef.current)
        parallaxLayers.forEach((layer) => {
          const speed = Number(layer.dataset.parallax ?? 0)
          if (!speed) return

          gsap.fromTo(
            layer,
            { x: -speed },
            {
              x: speed,
              ease: 'none',
              scrollTrigger: {
                trigger: layer.closest('[data-panel]') ?? layer,
                containerAnimation: horizontal,
                start: 'left right',
                end: 'right left',
                scrub: true,
              },
            },
          )
        })

        return () => {
          triggerRef.current = null
        }
      })

      mm.add(MOBILE_QUERY, () => {
        const panels = gsap.utils.toArray<HTMLElement>('[data-panel]', shellRef.current)
        const [heroPanel, ...restPanels] = panels

        restPanels.forEach((panel) => {
          const reveals = panel.querySelectorAll<HTMLElement>('[data-reveal]')
          if (!reveals.length) return

          gsap.from(reveals, {
            y: 48,
            opacity: 0,
            duration: 0.75,
            stagger: 0.08,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: panel,
              start: 'top bottom-=40px',
              toggleActions: 'play none none reverse',
            },
          })
        })

        if (heroPanel) {
          const artwork = heroPanel.querySelector<HTMLElement>('.artwork')
          if (artwork) {
            gsap.fromTo(
              artwork,
              { y: 0, rotate: 0, scale: 1 },
              {
                y: () => window.innerHeight * -0.06,
                rotate: 1.4,
                scale: 1,
                ease: 'none',
                scrollTrigger: {
                  trigger: heroPanel,
                  start: 'top top',
                  end: 'bottom top',
                  scrub: true,
                  invalidateOnRefresh: true,
                },
              },
            )
          }
        }

        ScrollTrigger.create({
          start: 0,
          end: 'max',
          onUpdate: (self) => {
            if (progressRef.current) {
              progressRef.current.style.transform = `scaleX(${self.progress})`
            }
          },
        })
      })

      return () => mm.revert()
    },
    { scope: shellRef },
  )

  return (
    <main className="page-shell" ref={shellRef}>
      <div className="ambient" aria-hidden="true">
        <span className="ambient-orb orb-yellow" />
        <span className="ambient-orb orb-teal" />
        <span className="ambient-orb orb-coral" />
        <span className="ambient-shape ambient-spark spark-1">✦</span>
        <span className="ambient-shape ambient-spark spark-2">✦</span>
        <span className="ambient-shape ambient-plus plus-1">＋</span>
        <span className="ambient-shape ambient-plus plus-2">＋</span>
        <span className="ambient-shape ambient-ring" />
        <span className="ambient-shape ambient-star">✳</span>
      </div>

      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Cutlass Studio home" onClick={handleAnchorClick('top')}><span className="brand-mark">C</span><span>Cutlass Studio</span></a>
        <span className="edition"><span className="live-dot" /> OPEN CALL · 2026</span>
        <div className="topbar-actions">
          <span className="panel-counter" aria-hidden="true"><span ref={counterRef}>01 / 04</span></span>
          <a className="top-link" href="#submission" onClick={handleAnchorClick('submission')}>Enter now <ArrowUpRight aria-hidden="true" /></a>
        </div>
        <span className="scroll-progress" aria-hidden="true"><span className="scroll-progress-bar" ref={progressRef} /></span>
      </header>

      <div className="h-viewport" ref={viewportRef}>
        <div className="h-track" ref={trackRef}>
          <section className="panel panel-hero" id="top" data-panel>
            <div className="panel-inner">
              <div className="hero">
                <div className="hero-copy">
                  <p className="eyebrow" data-reveal><span className="eyebrow-line" /> LOGO ART COMPETITION <span className="eyebrow-line" /></p>
                  <h1 data-reveal>Imagine.<br /><span>Interpret.</span><br />Create.</h1>
                  <p className="hero-description" data-reveal>An invitation to explore the beauty, symbols, and stories of Logo art through your own perspective.</p>
                  <div className="hero-actions" data-reveal>
                    <a className="hero-secondary" href="/rules">Read the rules <ArrowUpRight aria-hidden="true" /></a>
                    <a className="hero-cta" href="#submission" onClick={handleAnchorClick('submission')}>Submit your work <ArrowUpRight aria-hidden="true" /></a>
                  </div>
                  <div className="hero-note" data-reveal><span className="note-icon"><Sparkles aria-hidden="true" /></span><span>Your culture. Your language.<br /><strong>A new perspective.</strong></span></div>
                </div>
                <div className="artwork-wrap">
                  <div className="artwork" ref={artworkRef} aria-label="Abstract art composition inspired by Logo art" role="img" data-reveal onPointerDown={handleArtworkPointer} onPointerMove={handleArtworkPointer} onPointerUp={handleArtworkEnd} onPointerLeave={handleArtworkEnd} onPointerCancel={handleArtworkEnd}>
                    <div className="art-glow" />
                    <div className="sun-disc" data-parallax="26" />
                    <div className="art-circle circle-one" data-parallax="-18" /><div className="art-circle circle-two" data-parallax="30" />
                    <div className="art-arc" />
                    <div className="art-stroke stroke-one" /><div className="art-stroke stroke-two" />
                    <span className="art-caption">FIG. 01 — FORMS IN DIALOGUE</span>
                    <span className="art-index">01 / 03</span>
                    <div className="art-vertical">COLOR STUDY · 2026</div>
                    <span className="art-touch-glow" aria-hidden="true" />
                  </div>
                  <span className="art-spark art-spark-a" aria-hidden="true">✦</span>
                  <span className="art-spark art-spark-b" aria-hidden="true">✦</span>
                  <span className="art-plus" aria-hidden="true">＋</span>
                  <div className="art-badge" aria-hidden="true">
                    <svg className="badge-ring" viewBox="0 0 120 120">
                      <defs>
                        <path id="badgePath" d="M60,60 m-45,0 a45,45 0 1,1 90,0 a45,45 0 1,1 -90,0" />
                      </defs>
                      <text>
                        <textPath href="#badgePath">OPEN CALL ✦ 2026 ✦ CUTLASS STUDIO ✦ SUBMIT YOUR WORK ✦ </textPath>
                      </text>
                    </svg>
                    <span className="badge-core">✦</span>
                  </div>
                </div>
              </div>
              <div className="scroll-cue" aria-hidden="true"><span>SCROLL</span></div>
            </div>
          </section>

          <section className="panel panel-manifesto" data-panel>
            <div className="panel-inner">
              <div className="manifesto">
                <span className="manifesto-index" data-reveal>01 — THE INVITATION</span>
                <p data-reveal>Art needs no translation. <span>We want to see the artwork you create as a logo, inspired by this visual richness.</span></p>
                <a href="#submission" onClick={handleAnchorClick('submission')} data-reveal>Explore the competition <ArrowUpRight aria-hidden="true" /></a>
              </div>
              <div className="marquee" aria-hidden="true">
                <div className="marquee-track">
                  <span className="marquee-group">IMAGINE <b>✦</b> INTERPRET <b>✦</b> CREATE <b>✦</b> SUBMIT <b>✦</b></span>
                  <span className="marquee-group">IMAGINE <b>✦</b> INTERPRET <b>✦</b> CREATE <b>✦</b> SUBMIT <b>✦</b></span>
                </div>
              </div>
            </div>
          </section>

          <section className="panel panel-submission" id="submission" data-panel>
            <div className="panel-inner">
              <div className="submission-section">
                <div className="form-intro">
                  <span className="intro-spark" aria-hidden="true">✳</span>
                  <p className="eyebrow" data-reveal><span className="eyebrow-line" /> YOUR TURN <span className="eyebrow-line" /></p>
                  <h2 data-reveal>The next<br />story is <span>yours.</span></h2>
                  <p data-reveal>Add your details and share your logo with us. The full rules and details will be available in our announcements channel.</p>
                  <div className="deadline" data-reveal><span className="deadline-mark"><Sparkles aria-hidden="true" /></span><span><strong>Open call</strong><br />Limited spots · Find the rules in announcements</span></div>
                </div>

                <div className="form-card" data-reveal>
                  {submitted ? (
                    <div className="success-state" role="status">
                      <span className="success-icon"><Check aria-hidden="true" /></span>
                      <p className="eyebrow">SUBMISSION COMPLETE</p>
                      <h3>Your artwork is<br />on its way.</h3>
                      <p>Thanks for sharing your perspective. Keep an eye on the announcements channel for next steps.</p>
                      <button className="text-button" type="button" onClick={resetForm}>Submit another artwork <ArrowUpRight aria-hidden="true" /></button>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} noValidate aria-busy={submitting}>
                      <div className="form-heading"><span className="form-step">02 / 02</span><span className="form-heading-label">ENTRY FORM</span></div>
                      <label className="field-label" htmlFor="fullName">Full name <span>*</span></label>
                      <input className="text-input" id="fullName" name="fullName" placeholder="What should we call you?" autoComplete="name" required disabled={submitting} aria-invalid={nameError ? true : undefined} aria-describedby={nameError ? 'fullName-error' : undefined} onChange={() => { if (nameError) setNameError(''); if (submitError) setSubmitError('') }} />
                      {nameError && <p className="field-error" id="fullName-error" role="alert">{nameError}</p>}
                      <label className="field-label upload-label" htmlFor="artwork">Your artwork <span>*</span></label>
                      <input ref={inputRef} className="visually-hidden" id="artwork" name="artwork" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" required disabled={submitting} onChange={(event) => selectFile(event.target.files?.[0])} />
                      <button className={`upload-zone${file ? ' has-file' : ''}`} type="button" disabled={submitting} aria-invalid={fileError ? true : undefined} onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const dropped = event.dataTransfer.files[0]; if (dropped) { const transfer = new DataTransfer(); transfer.items.add(dropped); if (inputRef.current) inputRef.current.files = transfer.files; selectFile(dropped) } }} aria-describedby="upload-help">
                        {file ? <><FileImage aria-hidden="true" /><span className="upload-copy"><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(2)} MB · Ready to submit</small></span><span className="remove-file" onClick={(event) => { event.stopPropagation(); selectFile(); if (inputRef.current) inputRef.current.value = '' }} aria-label="Quitar archivo"><X aria-hidden="true" /></span></> : <><span className="upload-icon"><ImagePlus aria-hidden="true" /></span><span className="upload-copy"><strong>Drop your artwork here</strong><small>or <span className="browse-link">browse your files</span></small></span><span className="upload-action"><Upload aria-hidden="true" /></span></>}
                      </button>
                      <p className={`upload-help${fileError ? ' has-error' : ''}`} id="upload-help" aria-live="polite">{fileError || 'JPG, PNG, WEBP, or PDF · Up to 20 MB'}</p>
                      <label className="terms-row"><input id="terms" type="checkbox" name="terms" required disabled={submitting} aria-invalid={termsError ? true : undefined} aria-describedby={termsError ? 'terms-error' : undefined} onChange={() => { if (termsError) setTermsError(''); if (submitError) setSubmitError('') }} /><span className="custom-check"><Check aria-hidden="true" /></span><span>I have read and agree to the <a href="/rules">competition rules</a> and consent to the use of my work under those terms.</span></label>
                      {termsError && <p className="field-error" id="terms-error" role="alert">{termsError}</p>}
                      <button className={`submit-button${submitting ? ' is-uploading' : ''}`} type="submit" disabled={submitting}>
                        {submitting ? <><span>Uploading artwork</span><span>{uploadProgress}%</span></> : <><span>Submit my artwork</span><ArrowUpRight aria-hidden="true" /></>}
                        <span className="submit-progress" style={{ transform: `scaleX(${uploadProgress / 100})` }} aria-hidden="true" />
                      </button>
                      {submitError && <p className="form-error" role="alert">{submitError}</p>}
                      <p className="form-footnote"><span className="required-star">*</span> Required fields <span className="footnote-divider">·</span> Your information is secure</p>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </section>

          <footer className="panel panel-footer" id="bases" data-panel>
            <div className="panel-inner">
              <span className="footer-year" aria-hidden="true">2026</span>
              <span className="footer-spark" aria-hidden="true">✦</span>
              <div className="footer">
                <a className="wordmark footer-brand" href="#top" aria-label="Cutlass Studio home" onClick={handleAnchorClick('top')} data-reveal><span className="brand-mark">C</span><span>Cutlass Studio</span></a>
                <span data-reveal>A CELEBRATION OF CREATIVITY WITHOUT BORDERS.</span>
                <a href="#submission" onClick={handleAnchorClick('submission')} data-reveal>Announcements channel <ArrowUpRight aria-hidden="true" /></a>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </main>
  )
}
