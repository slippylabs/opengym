// @vitest-environment happy-dom
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'

const mocks = vi.hoisted(() => ({ api: vi.fn(), setUser: vi.fn(), adopt: vi.fn(async () => {}) }))
vi.mock('../../lib/api.js', () => ({ api: (...a) => mocks.api(...a) }))
vi.mock('../../sheets.jsx', () => ({ askAddDeviceData: vi.fn() }))

import { useStore } from '../../store/useStore.js'
import { SsoButton, SsoRow, ssoSignedOut } from './Sso.jsx'

let host, root
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  mocks.api.mockReset(); mocks.setUser.mockReset()
  useStore.setState({ setUser: mocks.setUser, adoptProfile: mocks.adopt, user: null })
  localStorage.clear()
})
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('Sign in with Slippy Labs', () => {
  it('is not offered when the server does no SSO', () => {
    useStore.setState({ config: {} })
    act(() => root.render(<SsoButton />))
    expect(host.textContent).toBe('')
    expect(mocks.api).not.toHaveBeenCalled()
  })

  it('tries silently once, and a site login signs straight in', async () => {
    mocks.api.mockResolvedValue({ user: { id: 'u', name: 'ada', sso: 'ada' } })
    useStore.setState({ config: { sso: true } })
    await act(async () => { root.render(<SsoButton />) })
    expect(mocks.api).toHaveBeenCalledWith('/api/sso/login', { method: 'POST', body: '{}' })
    expect(mocks.setUser).toHaveBeenCalledWith({ id: 'u', name: 'ada', sso: 'ada' }, { adopt: true })
    expect(host.textContent).toContain('Sign in with Slippy Labs')
  })

  it('after signing out there is no silent try, so signing out sticks', async () => {
    ssoSignedOut()
    expect(localStorage.getItem('slip-sso-auto')).toBe('off')
  })

  it('Settings shows the linked login, or offers to link one', () => {
    useStore.setState({ config: { sso: true }, user: { id: 'u', name: 'slippy', sso: 'slippy' } })
    act(() => root.render(<SsoRow />))
    expect(host.textContent).toContain('Slippy Labs account')
    expect(host.textContent).toContain('slippy')
    useStore.setState({ user: { id: 'u', name: 'slippy' } })
    act(() => root.render(<SsoRow />))
    expect(host.textContent).toContain('Link my Slippy Labs account')
  })
})
