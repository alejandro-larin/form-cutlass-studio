import { ArrowUpRight, Clock, Contrast, Droplets, Palette, Trophy, Type, Users } from 'lucide-react'

const steps = [
  { title: 'Design your logo', body: 'Follow the design rules and guidelines below to create a clean, bold identity.' },
  { title: 'Submit through the form', body: 'Upload your completed design through the official submission form on this site before the deadline.' },
  { title: 'Back-to-back votes', body: 'After the deadline, we hold round after round of votes until we reach the finals three.' },
  { title: 'In-person final', body: 'The top three designs go to an in-person final vote at our club meeting to choose the winner.' },
]

const guidelines = [
  {
    icon: Palette,
    title: 'Keep it simple',
    body: 'Clean, bold designs work best at any size.',
  },
  {
    icon: Droplets,
    title: 'Color limit',
    body: 'Use no more than 3 or 4 colors.',
  },
  {
    icon: Contrast,
    title: 'Black & white compatibility',
    body: 'Make sure your design is still clear and easy to read in black and white.',
  },
  {
    icon: Type,
    title: 'Required element',
    body: 'Include “Cutlass Studio” in your design so everyone knows it’s from our club at future events.',
  },
]

export function CompetitionRules() {
  return (
    <main className="rules-shell">
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
        <a className="wordmark" href="/" aria-label="Cutlass Studio home"><span className="brand-mark">C</span><span>Cutlass Studio</span></a>
        <span className="edition"><span className="live-dot" /> OPEN CALL · 2026</span>
        <div className="topbar-actions">
          <a className="top-link" href="/#submission">Submit your work <ArrowUpRight aria-hidden="true" /></a>
        </div>
      </header>

      <div className="rules-main">
        <section className="rules-hero">
          <p className="eyebrow"><span className="eyebrow-line" /> COMPETITION RULES <span className="eyebrow-line" /></p>
          <h1 className="rules-title">Design the<br /><span>Cutlass</span><br />identity.</h1>
          <p className="rules-intro">
            Kick off Cutlass Studio’s first project by helping us create our official identity! Since we are starting from
            scratch, we want our members to design the logo that will represent our club on flyers, merch, and animated
            shorts. Upload your completed design through the <a href="/#submission">official submission form</a> on this
            site — you have 2 weeks from today to submit your entry (12/6/2026).
          </p>
          <div className="rules-meta">
            <div className="rules-meta-item"><Clock aria-hidden="true" /><span><strong>Deadline</strong>12/6/2026</span></div>
            <div className="rules-meta-item"><Users aria-hidden="true" /><span><strong>Timeline</strong>2 weeks</span></div>
            <div className="rules-meta-item"><Trophy aria-hidden="true" /><span><strong>Final vote</strong>In person</span></div>
          </div>
        </section>

        <section className="rules-section">
          <span className="manifesto-index">01 — HOW IT WORKS</span>
          <h2>From draft to<br /><span>official logo.</span></h2>
          <ol className="rules-steps">
            {steps.map((step) => (
              <li key={step.title}>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </li>
            ))}
          </ol>
          <div className="rules-prize">
            <Trophy aria-hidden="true" />
            <span>
              The winning artist earns bragging rights as the creator of Cutlass Studio’s founding logo, official
              recognition from the club, and a $5 gift card to a local ice cream shop!
            </span>
          </div>
        </section>

        <section className="rules-section">
          <span className="manifesto-index">02 — DESIGN RULES &amp; GUIDELINES</span>
          <h2>Make it work<br /><span>everywhere.</span></h2>
          <p className="rules-intro">To help our first logo look great wherever we use it, please follow these guidelines:</p>
          <div className="rules-grid">
            {guidelines.map((guideline) => {
              const Icon = guideline.icon
              return (
                <article className="rules-card" key={guideline.title}>
                  <span className="rules-card-icon"><Icon aria-hidden="true" /></span>
                  <h3>{guideline.title}</h3>
                  <p>{guideline.body}</p>
                </article>
              )
            })}
          </div>
        </section>

        <section className="rules-cta">
          <h2>Ready to make<br /><span>history?</span></h2>
          <p>Submit your design before 12/6/2026 and help shape the identity of Cutlass Studio.</p>
          <a className="hero-cta" href="/#submission">Submit your entry <ArrowUpRight aria-hidden="true" /></a>
        </section>

        <footer className="rules-footer">
          <a className="wordmark" href="/" aria-label="Cutlass Studio home"><span className="brand-mark">C</span><span>Cutlass Studio</span></a>
          <span>A CELEBRATION OF CREATIVITY WITHOUT BORDERS.</span>
          <a href="/#submission">Back to the competition</a>
        </footer>
      </div>
    </main>
  )
}
