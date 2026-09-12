'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Sheet } from '@/components/ui/Sheet'
import { Toast } from '@/components/ui/Toast'

/**
 * Every component state on one page, so regressions are visible.
 * P1 gate: this renders correctly in light and dark, is keyboard-navigable,
 * and reports zero axe violations.
 */
export default function TokensPage() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [toast, setToast] = useState(false)

  return (
    <div className="shell">
      <h1 className="t-title">Design system</h1>
      <p className="t-meta">Every state, light and dark. DESIGN-SYSTEM.md §4–5.</p>

      <section style={{ marginTop: 'var(--space-8)' }}>
        <h2 className="t-section">Buttons</h2>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-3)',
            marginTop: 'var(--space-4)',
            alignItems: 'flex-start',
          }}
        >
          <Button>Add to Splitwise</Button>
          <Button variant="secondary">Back</Button>
          <Button variant="tertiary">Type it in instead</Button>
          <Button variant="destructive">Delete</Button>
          <Button loading>Adding…</Button>
          <Button disabled disabledReason="Assign everyone to an item first">Add to Splitwise</Button>
        </div>
      </section>

      <section style={{ marginTop: 'var(--space-8)', maxWidth: '24rem' }}>
        <h2 className="t-section">Fields</h2>
        <div style={{ display: 'grid', gap: 'var(--space-5)', marginTop: 'var(--space-4)' }}>
          <Field label="Merchant" defaultValue="Walmart Supercenter" />
          <Field label="Tip" money placeholder="0.00" help="Leave blank if it's on the receipt." />
          <Field label="Price" money defaultValue="549" error="Prices look like 5.49" />
          <Field label="Total" money defaultValue="45.67" disabled />
        </div>
      </section>

      <section style={{ marginTop: 'var(--space-8)' }}>
        <h2 className="t-section">Type scale</h2>
        <div style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
          <span className="t-display">$45.67</span>
          <span className="t-title">Check the items</span>
          <span className="t-section">Split with</span>
          <span className="t-strong">Alex $13.10</span>
          <span className="t-body">Organic Milk</span>
          <span className="t-meta">Sep 11 · 4 people</span>
          <span className="t-caption">Tax split by who bought what</span>
        </div>
      </section>

      <section style={{ marginTop: 'var(--space-8)' }}>
        <h2 className="t-section">Person colours</h2>
        <p className="t-caption">Decorative. Initials carry identity — ACCESSIBILITY.md §3.2.</p>
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
          {['AK', 'MP', 'RS', 'JD', 'LM', 'TC', 'NP', 'BW'].map((initials, i) => (
            <span
              key={initials}
              style={{
                display: 'grid',
                placeItems: 'center',
                width: 44,
                height: 44,
                borderRadius: 'var(--radius-full)',
                background: `var(--person-${i + 1})`,
                color: 'var(--person-on)',
                fontWeight: 600,
                fontSize: 'var(--text-meta)',
              }}
            >
              {initials}
            </span>
          ))}
        </div>
      </section>

      <section style={{ marginTop: 'var(--space-8)' }}>
        <h2 className="t-section">Overlays</h2>
        <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
          <Button variant="secondary" onClick={() => setSheetOpen(true)}>
            Open sheet
          </Button>
          <Button variant="secondary" onClick={() => setToast(true)}>
            Show undo toast
          </Button>
        </div>
      </section>

      <Sheet
        open={sheetOpen}
        title="Add someone"
        description="They'll get a Splitwise invite from you."
        onClose={() => setSheetOpen(false)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setSheetOpen(false)}>Add to split</Button>
          </>
        }
      >
        <Field label="Name" placeholder="Maya" />
        <Field label="Email" type="email" placeholder="maya@example.com" />
      </Sheet>

      {toast ? (
        <Toast
          message="Deleted."
          actionLabel="Undo"
          duration={30}
          onAction={() => setToast(false)}
          onDismiss={() => setToast(false)}
        />
      ) : null}
    </div>
  )
}
