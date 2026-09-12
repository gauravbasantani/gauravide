'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadStep } from '@/components/flow/UploadStep'
import { ReviewStep } from '@/components/flow/ReviewStep'
import { AssignStep } from '@/components/flow/AssignStep'
import { ConfirmStep } from '@/components/flow/ConfirmStep'
import { Button } from '@/components/ui/Button'
import { clearDraft, loadDraft, saveDraft, type Draft, type Person, type Step } from '@/lib/draft'
import type { ExtractedReceipt } from '@/lib/receipt'
import { useSplitwise } from '@/lib/useSplitwise'
import flow from '@/components/flow/flow.module.css'

const EMPTY: ExtractedReceipt = {
  merchant: null,
  date: null,
  currency: 'USD',
  items: [],
  taxLines: [],
  subtotalCents: null,
  taxCents: 0,
  tipCents: 0,
  feeCents: 0,
  totalCents: null,
}

export default function NewSplitPage() {
  const router = useRouter()
  const sw = useSplitwise()
  const [step, setStep] = useState<Step>('upload')
  const [receipt, setReceipt] = useState<ExtractedReceipt>(EMPTY)
  const [warnings, setWarnings] = useState<string[]>([])
  const [people, setPeople] = useState<Person[]>([])
  const [assignments, setAssignments] = useState<Record<string, string[]>>({})
  const [payerId, setPayerId] = useState<string | null>(null)
  const [restored, setRestored] = useState<Draft | null>(null)

  // A dropped connection or a phone call must not cost fourteen assignments.
  useEffect(() => {
    const draft = loadDraft()
    if (draft && draft.step !== 'upload') setRestored(draft)
  }, [])

  useEffect(() => {
    if (step === 'upload') return
    saveDraft({ step, receipt, people, assignments, payerId })
  }, [step, receipt, people, assignments, payerId])

  const resume = useCallback(() => {
    if (!restored) return
    setStep(restored.step)
    setReceipt(restored.receipt)
    setPeople(restored.people)
    setAssignments(restored.assignments)
    setPayerId(restored.payerId)
    setRestored(null)
  }, [restored])

  function finish() {
    clearDraft()
    router.push('/')
  }

  return (
    <div className={[flow.page, 'shell'].join(' ')}>
      {restored ? (
        <div className={flow.notice} style={{ marginBottom: 'var(--space-5)' }}>
          <span className={flow.noticeIcon} aria-hidden="true">
            ↩
          </span>
          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            <span>You have a split in progress from earlier.</span>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <Button onClick={resume}>Pick up where I left off</Button>
              <Button
                variant="tertiary"
                onClick={() => {
                  clearDraft()
                  setRestored(null)
                }}
              >
                Start fresh
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {step === 'upload' ? (
        <>
          <div className={flow.head}>
            <h1 className="t-title">New receipt</h1>
          </div>
          <UploadStep
            onExtracted={(r, w) => {
              setReceipt(r)
              setWarnings(w)
              setStep('review')
            }}
            onManual={() => {
              setReceipt(EMPTY)
              setWarnings([])
              setStep('review')
            }}
          />
        </>
      ) : null}

      {step === 'review' ? (
        <ReviewStep
          receipt={receipt}
          warnings={warnings}
          onChange={setReceipt}
          onBack={() => setStep('upload')}
          onNext={() => setStep('assign')}
        />
      ) : null}

      {step === 'assign' ? (
        <AssignStep
          receipt={receipt}
          people={people}
          available={sw.signedIn ? [sw.me, ...sw.friends].filter(Boolean) as typeof sw.friends : undefined}
          assignments={assignments}
          onPeople={setPeople}
          onAssignments={setAssignments}
          onBack={() => setStep('review')}
          onNext={() => setStep('confirm')}
        />
      ) : null}

      {step === 'confirm' ? (
        <ConfirmStep
          receipt={receipt}
          people={people}
          assignments={assignments}
          payerId={payerId}
          onPayer={setPayerId}
          groups={sw.groups}
          signedIn={sw.signedIn}
          onBack={() => setStep('assign')}
          onDone={finish}
        />
      ) : null}
    </div>
  )
}
