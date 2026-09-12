'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
  type EditTarget,
  type Person,
  type SplitSettings,
  type Step,
} from '@/lib/draft'
import { clearDraftImage, loadDraftImage, saveDraftImage } from '@/lib/imageStore'
import {
  splitQuantityIntoItems,
  tidyReceipt,
  withItemIds,
  type ExtractedReceipt,
} from '@/lib/receipt'
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

type PhotoStatus = 'saving' | 'saved' | 'failed' | null

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
  const [editing, setEditing] = useState<EditTarget | null>(null)
  const [restored, setRestored] = useState<Draft | null>(null)
  const [receiptImage, setReceiptImage] = useState<Blob | null>(null)
  const [photoStatus, setPhotoStatus] = useState<PhotoStatus>(null)

  const apply = useCallback((draft: Draft) => {
    setStep(draft.step)
    setReceipt(draft.receipt)
    setPeopleState(draft.people)
    setAssignments(draft.assignments)
    setPayerId(draft.payerId)
    setSettings(draft.settings)
    setSubmitKey(draft.submitKey)
    setSubmittedExpenseId(draft.submittedExpenseId)
    setEditing(draft.editing)
    setRestored(null)
    void loadDraftImage().then(setReceiptImage)
  }, [])

  // A dropped connection, a phone call, or the Splitwise sign-in round trip
  // must not cost fourteen assignments.
  useEffect(() => {
    const draft = loadDraft()
    if (!draft || draft.step === 'upload') return
    // "Edit split" on a saved split lands straight in the flow.
    if (draft.editing && new URLSearchParams(window.location.search).has('edit')) {
      apply(draft)
      return
    }
    setRestored(draft)
  }, [apply])

  useEffect(() => {
    if (step === 'upload') return
    saveDraft({
      step,
      receipt,
      people,
      assignments,
      payerId,
      settings,
      submitKey,
      submittedExpenseId,
      editing,
    })
  }, [step, receipt, people, assignments, payerId, settings, submitKey, submittedExpenseId, editing])

  const imageUrl = useMemo(
    () => (receiptImage ? URL.createObjectURL(receiptImage) : null),
    [receiptImage],
  )
  useEffect(
    () => () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl)
    },
    [imageUrl],
  )

  function startDraft(next: ExtractedReceipt, nextWarnings: string[], image?: Blob) {
    clearDraft()
    void clearDraftImage()
    setRestored(null)
    setReceipt(withItemIds(tidyReceipt(next), newId))
    setWarnings(nextWarnings)
    setPeopleState([])
    setAssignments({})
    setPayerId(null)
    setSettings(DEFAULT_SETTINGS)
    setSubmitKey(newId())
    setSubmittedExpenseId(null)
    setEditing(null)
    setPhotoStatus(null)
    // Photos only — a PDF has no preview worth keeping.
    const photo = image && image.type.startsWith('image/') ? image : null
    setReceiptImage(photo)
    if (photo) void saveDraftImage(photo)
    setStep('review')
  }

  /**
   * Removing someone must also remove them everywhere they were referenced —
   * as a payer, a share, or an exact amount — or a stale id reaches Splitwise.
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

  /**
   * A name typed before signing in becomes a real Splitwise friend: every
   * item, share, exact amount and payment moves to the new id (FR-40).
   */
  function replacePerson(oldId: string, person: Person) {
    const swap = (id: string) => (id === oldId ? person.id : id)
    function rekey<T>(record: Record<string, T>): Record<string, T> {
      return Object.fromEntries(Object.entries(record).map(([key, value]) => [swap(key), value]))
    }
    setPeopleState(people.map((p) => (p.id === oldId ? person : p)))
    setAssignments(
      Object.fromEntries(Object.entries(assignments).map(([key, ids]) => [key, ids.map(swap)])),
    )
    setPayerId((current) => (current === oldId ? person.id : current))
    setSettings((current) => ({
      ...current,
      included: current.included?.map(swap) ?? null,
      weights: rekey(current.weights),
      exact: rekey(current.exact),
      payers: current.payers?.map((p) => ({ ...p, personId: swap(p.personId) })) ?? null,
      itemSplits: Object.fromEntries(
        Object.entries(current.itemSplits).map(([key, split]) => [
          key,
          { ...split, values: rekey(split.values) },
        ]),
      ),
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

  /** Tomatoes ×4 → four lines, each starting with whoever had the whole line. */
  function splitUnits(itemId: string) {
    const index = receipt.items.findIndex((item) => item.id === itemId)
    const item = receipt.items[index]
    if (!item) return
    const units = splitQuantityIntoItems(item)
    if (units.length < 2) return
    setReceipt({
      ...receipt,
      items: [...receipt.items.slice(0, index), ...units, ...receipt.items.slice(index + 1)],
    })
    const holders = assignments[itemId] ?? []
    setAssignments({
      ...assignments,
      ...Object.fromEntries(units.map((unit) => [unit.id ?? '', holders])),
    })
    setSettings((current) => ({
      ...current,
      itemSplits: Object.fromEntries(
        Object.entries(current.itemSplits).filter(([key]) => key !== itemId),
      ),
    }))
  }

  /** Splitwise accepted it. Keep the photo with the saved split (FR-38). */
  async function submitted(expenseId: number, splitId: string | null) {
    setSubmittedExpenseId(expenseId)
    if (!receiptImage || !splitId || editing) return
    setPhotoStatus('saving')
    try {
      const form = new FormData()
      form.append('file', receiptImage, 'receipt')
      const res = await fetch(`/api/splits/${splitId}/image`, { method: 'POST', body: form })
      setPhotoStatus(res.ok ? 'saved' : 'failed')
    } catch {
      setPhotoStatus('failed')
    }
  }

  function leave(to: string) {
    clearDraft()
    void clearDraftImage()
    router.push(to)
    router.refresh()
  }

  const finish = () => leave(editing ? `/split/${editing.splitId}` : '/')

  const currentStep = Math.max(
    0,
    FLOW_STEPS.findIndex((item) => item.key === step),
  )
  const meId = sw.me ? String(sw.me.id) : null
  const friends = sw.signedIn
    ? ([sw.me, ...sw.friends].filter(Boolean) as typeof sw.friends)
    : undefined

  return (
    <div className={[flow.page, 'shell'].join(' ')}>
      <nav className={flow.progress} aria-label="Receipt split progress">
        <div className={flow.progressTopline}>
          <span className="t-label">{editing ? 'Editing split' : 'New split'}</span>
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

      {editing && !submittedExpenseId ? (
        <div className={flow.helper} role="status">
          <span className={flow.helperIcon} aria-hidden="true">
            ✎
          </span>
          <div className={flow.helperContent}>
            <strong>Editing “{editing.merchant ?? 'Receipt'}”</strong>
            <span>
              Change anything — items, people, who paid, or the group. Saving updates the same
              Splitwise expense for everyone in it; nothing is duplicated.
            </span>
            <span>
              <Button variant="tertiary" onClick={() => leave(`/split/${editing.splitId}`)}>
                Cancel editing
              </Button>
            </span>
          </div>
        </div>
      ) : null}

      {restored ? (
        <div className={flow.notice} style={{ marginBottom: 'var(--space-5)' }}>
          <span className={flow.noticeIcon} aria-hidden="true">
            ↩
          </span>
          <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
            <span>
              {restored.submittedExpenseId
                ? 'Your last split was already added to Splitwise.'
                : restored.editing
                  ? `You were editing “${restored.editing.merchant ?? 'Receipt'}”.`
                  : 'You have a split in progress from earlier.'}
            </span>
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              <Button onClick={() => apply(restored)}>
                {restored.submittedExpenseId
                  ? 'See it'
                  : restored.editing
                    ? 'Continue editing'
                    : 'Pick up where I left off'}
              </Button>
              <Button
                variant="tertiary"
                onClick={() => {
                  clearDraft()
                  void clearDraftImage()
                  setRestored(null)
                }}
              >
                {restored.editing ? 'Discard changes' : 'Start fresh'}
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
            onExtracted={(r, w, _source, image) => startDraft(r, w, image)}
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
          imageUrl={imageUrl}
          onChange={setReceipt}
          onBack={() => (editing ? leave(`/split/${editing.splitId}`) : setStep('upload'))}
          onNext={goToAssign}
        />
      ) : null}

      {step === 'assign' ? (
        <AssignStep
          receipt={receipt}
          people={people}
          me={sw.me}
          available={friends}
          canSignIn={!sw.loading && !sw.signedIn}
          assignments={assignments}
          settings={settings}
          onPeople={(next) => {
            setPeople(next)
            // The first person added is the natural default payer.
            if (!payerId && next[0]) setPayerId(next.find((p) => p.id === meId)?.id ?? next[0].id)
          }}
          onReplacePerson={replacePerson}
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
          onSplitUnits={splitUnits}
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
          onSubmitted={(expenseId, splitId) => void submitted(expenseId, splitId)}
          editing={editing}
          photoStatus={photoStatus}
          available={friends}
          onAddPerson={(person) => setPeople([...people, person])}
          onBack={() => setStep('assign')}
          onDone={finish}
        />
      ) : null}
    </div>
  )
}
