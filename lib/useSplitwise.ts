'use client'

import { useEffect, useState } from 'react'

export type SwPerson = { id: number; name: string }
export type SwGroup = { id: number; name: string; updatedAt: string | null; members: SwPerson[] }

export type SplitwiseState = {
  loading: boolean
  signedIn: boolean
  reauth: boolean
  me: SwPerson | null
  groups: SwGroup[]
  friends: SwPerson[]
  error: string | null
}

const EMPTY: SplitwiseState = {
  loading: true,
  signedIn: false,
  reauth: false,
  me: null,
  groups: [],
  friends: [],
  error: null,
}

/**
 * Groups and friends, fetched once after sign-in so the assignment screen
 * opens instantly with real faces on it — no spinner at the moment the user
 * is trying to think (FR-11a).
 */
export function useSplitwise(): SplitwiseState {
  const [state, setState] = useState<SplitwiseState>(EMPTY)

  useEffect(() => {
    let cancelled = false
    fetch('/api/splitwise/me')
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return
        setState({
          loading: false,
          signedIn: Boolean(body.signedIn),
          reauth: Boolean(body.reauth),
          me: body.me ?? null,
          groups: body.groups ?? [],
          friends: body.friends ?? [],
          error: body.error ? (body.message ?? 'Couldn’t reach Splitwise.') : null,
        })
      })
      .catch(() => {
        if (!cancelled) setState({ ...EMPTY, loading: false, error: 'Couldn’t reach Splitwise.' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

/**
 * Rank groups by how well their members match the people in the split
 * (FR-19b). An exact match is what gets pre-selected, so the common case
 * costs zero taps.
 */
export function rankGroups(groups: SwGroup[], peopleIds: number[]): SwGroup[] {
  const wanted = new Set(peopleIds)
  return [...groups]
    .map((g) => {
      const ids = new Set(g.members.map((m) => m.id))
      const present = [...wanted].filter((id) => ids.has(id)).length
      const exact = present === wanted.size && ids.size === wanted.size
      return { g, score: present * 10 + (exact ? 100 : 0) }
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.g.updatedAt ?? '').localeCompare(a.g.updatedAt ?? '') ||
        a.g.name.localeCompare(b.g.name),
    )
    .map((x) => x.g)
}

/** Who from this split is missing from that group (FR-19c). */
export function missingFrom(group: SwGroup, people: SwPerson[]): SwPerson[] {
  const ids = new Set(group.members.map((m) => m.id))
  return people.filter((p) => !ids.has(p.id))
}
