import type { Metadata } from 'next'
import { CompetitionRules } from '@/components/competition-rules'

export const metadata: Metadata = {
  title: 'Competition Rules — Cutlass Studio',
  description: 'Read the rules and guidelines for the Cutlass Studio logo art competition, including deadlines, voting, prizes, and design requirements.',
}

export default function Page() {
  return <CompetitionRules />
}
