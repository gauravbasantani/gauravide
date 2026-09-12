'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UploadStep } from '@/components/flow/UploadStep'
import { ReviewStep } from '@/components/flow/ReviewStep'
import { AssignStep } from '@/components/flow/AssignStep'
import { ConfirmStep } from '@/components/flow/ConfirmStep'
import { Button } from '@/components/ui/Button'
import {
  clearDraft,
  DEFAULT_SETTINGS,
  loadDraft,
  saveDraft,
  type Draft,
  type Person,
  type SplitSettings,
  type Step,
} from '@/lib/draft'
import { withItemIds, type ExtractedReceipt } from '@/lib/receipt'
import { useSplitwise } from '@/lib/useSplitwise'
import flow from '@/components/flow/flow.module.css'

const FLOW_STEPS: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Receipt' },
  { key: 'review', label: 'Items' },
  { key: 'assign', label: 'Split' },
  { key: 'confirm', label: 'Send' },
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

const newId = () => crypto.randomUUID()

export default function NewSplitPage() {
  const router = useRouter()
  const sw = useSplitwise()
  const [step, setStep] = useState<Step>('upload')
  const [receipt, setReceipt] = useState<ExtractedReceipt>(EMPTY)
  const [warnings, setWarnings] = useState<string[]>([])
  const [people, setPeopleState] = useState<Person[]>([])
  const [assignments, setAssignments] = useState<Record<string, string[]>>({})
  const [payerId, setPayerId] = useState<string | null>(null)
  const [settings, setSettings] = useState<SplitSettings>(DEFAULT_SETTINGS)
  const [submitKey, setSubmitKey] = useState<string>(() => newId())
  const [submittedExpenseId, setSubmittedExpenseId] = useState<number | null>(null)
  const [restored, setRestored] = useState<Draft | null>(null)

  // A dropped connection or a phone call must not cost fourteen assignments.
  useEffect(() => {
    const draft = loadDraft()
    if (draft && draft.step !== 'upload') setRestored(draft)
  }, [])

  useEffect(() => {
    if (step === 'upload') return
    saveDraft({ step, receipt, people, assignments, payerId, settings, submitKey, submittedExpenseId })
  }, [step, receipt, people, assignments, payerId, settings, submitKey, submittedExpenseId])

  const resume = useCallback(() => {
    if (!restored) return
    setStep(restored.step)
    setReceipt(restored.receipt)
    setPeopleState(restored.people)
    setAssignments(restored.assignments)
    setPayerId(restored.payerId)
    setSettings(restored.settings)
    setSubmitKey(restored.submitKey)
    setSubmittedExpenseId(restored.submittedExpenseId)
    setRestored(null)
  }, [restored])

  function startDraft(next: ExtractedReceipt, nextWarnings: string[]) {
    clearDraft()
    setRestored(null)
    setReceipt(withItemIds(next, newId))
    setWarnings(nextWarnings)
    setPeopleState([])
    setAssignments({})
    setPayerId(null)
    setSettings(DEFAULT_SETTINGS)
    setSubmitKey(newId())
    setSubmittedExpenseId(null)
    setStep('review')
  }

  /**
   * Removing someone must also remove them everywhere they were referenced —
   * as a payer, a share, or an exact amount — or a stale id reaches Splitwise
   * (review finding 2).
   */
  function setPeople(next: Person[]) {
    const ids = new Set(next.map((p) => p.id))
    setPeopleState(next)
    setPayerId((current) => (current && ids.has(current) ? current : null))
    setSettings((current) => ({
      ...current,
      included: current.included?.filter((id) => ids.has(id)) ?? null,
      payers: current.payers?.filter((p) => ids.has(p.personId)) ?? null,
    }))
  }

  function goToAssign() {
    // You are almost always part of your own receipt. Start with you in it,
    // and as the payer; both are one tap to change (FR-19).
    if (people.length === 0 && sw.signedIn && sw.me) {
      const me = { id: String(sw.me.id), name: sw.me.name }
      setPeopleState([me])
      setPayerId(me.id)
    }
    setStep('assign')
  }

  function finish() {
    clearDraft()
    router.push('/')
    router.refresh()
  }

  const currentStep = Math.max(
    0,
    FLOW_STEPS.findIndex((item) => item.key === step),
  )
  const meId = sw.me ? String(sw.me.id) : null

  return (
    <div className={[flow.page, 'shell'].join(' ')}>
      <nav className={flow.progress} aria-label="Receipt split progress">
        <div className={flow.progressTopline}>
          <span className="t-label">New split</span>
          <span className="t-caption">
            Step {currentStep + 1} of {FLOW_STEPS.length}
          </span>
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
            <span>
              {restored.submittedExpenseId
                ? 'Your last split was already added to Splitwise.'
                : 'You have a split in progress from earlier.'}
            </span>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <Button onClick={resume}>
                {restored.submittedExpenseId ? 'See it' : 'Pick up where I left off'}
              </Button>
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
              <p className="t-meta">Start with a photo, an upload, or type it in.</p>
            </div>
          </div>
          <UploadStep
            onExtracted={(r, w) => startDraft(r, w)}
            onManual={() =>
              startDraft({ ...EMPTY, items: [{ name: '', qty: 1, cents: 0, confidence: 1 }] }, [])
            }
          />
        </>
      ) : null}

      {step === 'review' ? (
        <ReviewStep
          receipt={receipt}
          warnings={warnings}
          onChange={setReceipt}
          onBack={() => setStep('upload')}
          onNext={goToAssign}
        />
      ) : null}

      {step === 'assign' ? (
        <AssignStep
          receipt={receipt}
          people={people}
          me={sw.me}
          available={
            sw.signedIn ? ([sw.me, ...sw.friends].filter(Boolean) as typeof sw.friends) : undefined
          }
          assignments={assignments}
          settings={settings}
          onPeople={(next) => {
            setPeople(next)
            // The first person added is the natural default payer.
            if (!payerId && next[0]) setPayerId(next.find((p) => p.id === meId)?.id ?? next[0].id)
          }}
          onAssignments={setAssignments}
          onSettings={setSettings}
          onAddSplitwisePerson={
            sw.signedIn
              ? async ({ name, email }) => {
                  const response = await fetch('/api/splitwise/friend', {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ name, email }),
                  })
                  const body = await response.json().catch(() => ({}))
                  if (!response.ok || !body.person) {
                    throw new Error(body.message ?? 'Couldn’t add that person to Splitwise.')
                  }
                  return body.person
                }
              : undefined
          }
          onBack={() => setStep('review')}
          onNext={() => setStep('confirm')}
        />
      ) : null}

      {step === 'confirm' ? (
        <ConfirmStep
          receipt={receipt}
          people={people}
          assignments={assignments}
          settings={settings}
          payerId={payerId}
          meId={meId}
          onPayer={setPayerId}
          onSettings={setSettings}
          groups={sw.groups}
          signedIn={sw.signedIn}
          submitKey={submitKey}
          submittedExpenseId={submittedExpenseId}
          onSubmitted={setSubmittedExpenseId}
          onBack={() => setStep('assign')}
          onDone={finish}
        />
      ) : null}
    </div>
  )
}
