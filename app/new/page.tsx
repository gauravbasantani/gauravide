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

const FLOW_STEPS: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Add receipt' },
  { key: 'review', label: 'Check items' },
  { key: 'assign', label: 'Assign people' },
  { key: 'confirm', label: 'Finish' },
]

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

const MANUAL_START: ExtractedReceipt = {
  ...EMPTY,
  items: [{ name: '', qty: 1, cents: 0, confidence: 1 }],
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

  const currentStep = Math.max(
    0,
    FLOW_STEPS.findIndex((item) => item.key === step),
  )

  return (
    <div className={[flow.page, 'shell'].join(' ')}>
      <nav className={flow.progress} aria-label="Receipt split progress">
        <div className={flow.progressTopline}>
          <span className="t-label">Your split</span>
          <span className="t-caption">Step {currentStep + 1} of 4</span>
        </div>
        <ol className={flow.progressList}>
          {FLOW_STEPS.map((item, index) => (
            <li
              key={item.key}
              className={[
                flow.progressItem,
                index < currentStep ? flow.progressDone : '',
                index === currentStep ? flow.progressCurrent : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-current={index === currentStep ? 'step' : undefined}
            >
              <span className={flow.progressDot} aria-hidden="true">
                {index < currentStep ? '✓' : index + 1}
              </span>
              <span className={flow.progressText}>{item.label}</span>
            </li>
          ))}
        </ol>
      </nav>

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
            <div>
              <h1 className="t-title">New receipt</h1>
              <p className="t-meta">Start with a photo, upload, or enter the total yourself.</p>
            </div>
          </div>
          <UploadStep
            onExtracted={(r, w) => {
              setReceipt(r)
              setWarnings(w)
              setStep('review')
            }}
            onManual={() => {
              setReceipt(MANUAL_START)
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
          available={
            sw.signedIn ? ([sw.me, ...sw.friends].filter(Boolean) as typeof sw.friends) : undefined
          }
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
