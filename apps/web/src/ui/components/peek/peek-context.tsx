'use client'

import { createContext, useContext } from 'react'

const Ctx = createContext<() => void>(() => {})
export const PeekChangedProvider = Ctx.Provider

/**
 * Call after an action run inside a peek worked: the PeekHost fetches the item again (and Capture drops its cached
 * suggestions). Outside a peek it does nothing, so shared components (QuickLog, CategorySelect) can call it freely.
 */
export const usePeekChanged = () => useContext(Ctx)
