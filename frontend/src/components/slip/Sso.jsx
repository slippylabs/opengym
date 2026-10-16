// Single sign-on with a slippylabs.com account (the slippylabs fork). nginx asks the admin console
// who this browser is signed in as and hands the name to POST /api/sso/login, which opens the
// profile linked to that login, creating it the first time (api/server.js). Shown only when the
// server says it does SSO (`config.sso`).
//
// The login screen tries it silently once per page load, so someone already signed in to
// slippylabs never sees it. Signing out of openGym turns the silent try off on this browser
// (AUTO_KEY), or signing out would last until the next reload; pressing the button turns it on.
import { useEffect } from 'react'
import { useStore } from '../../store/useStore.js'
import { useUI } from '../../store/useUI.js'
import { api } from '../../lib/api.js'
import { t } from '../../lib/i18n.js'
import { Button, Row } from '../ui.jsx'
import { askAddDeviceData } from '../../sheets.jsx'

export const SITE_LOGIN = 'https://admin.slippylabs.com/login?next='
const AUTO_KEY = 'slip-sso-auto'
let triedThisLoad = false

const autoOn = () => { try { return localStorage.getItem(AUTO_KEY) !== 'off' } catch { return true } }
const setAuto = on => { try { if (on) localStorage.removeItem(AUTO_KEY); else localStorage.setItem(AUTO_KEY, 'off') } catch { /* private mode */ } }
/** Called on sign-out: no silent sign-in again until the button is pressed. */
export const ssoSignedOut = () => setAuto(false)

const toSiteLogin = () => { window.location.href = SITE_LOGIN + encodeURIComponent(window.location.href) }

/** Signs in with the slippylabs login. Without one, `silent` does nothing and a press goes to it. */
export async function ssoSignIn({ silent = false } = {}) {
  let u
  try { u = (await api('/api/sso/login', { method: 'POST', body: '{}' })).user }
  catch (e) {
    if (silent) return false
    if (e?.status === 401) toSiteLogin()
    else useUI.getState().toast(e?.data?.code === 'disabled' ? t('This account has been disabled') : t('Sign-in failed'))
    return false
  }
  const st = useStore.getState()
  st.setUser(u, { adopt: true })
  setAuto(true)
  await st.adoptProfile(askAddDeviceData)
  useUI.getState().toast(t('Welcome back, {0}', u.name))
  return true
}

/** The login screen's button, and the silent try behind it. */
export function SsoButton() {
  const config = useStore(s => s.config)
  useEffect(() => {
    if (!config?.sso || triedThisLoad || !autoOn()) return
    triedThisLoad = true
    ssoSignIn({ silent: true })
  }, [config?.sso])
  if (!config?.sso) return null
  return <>
    <Button variant="primary" icon="personCircle" onClick={() => { setAuto(true); ssoSignIn() }}>{t('Sign in with Slippy Labs')}</Button>
    <div className="dim small" style={{ margin: '6px 0 14px' }}>{t('Use your slippylabs.com account. Your openGym profile is created the first time.')}</div>
  </>
}

/** Settings → Account: which slippylabs login opens this profile, or a way to link one. */
export function SsoRow() {
  const config = useStore(s => s.config)
  const user = useStore(s => s.user)
  if (!config?.sso || !user) return null
  if (user.sso) return <Row icon="personCircle" iconTint="var(--green)" title={t('Slippy Labs account')} value={user.sso}
    subtitle={t('Signing in to slippylabs.com opens this profile.')} />
  const link = async () => {
    try {
      const u = (await api('/api/sso/link', { method: 'POST', body: '{}' })).user
      useStore.getState().setUser(u)
      useUI.getState().toast(t('Linked to {0}', u.sso))
    } catch (e) {
      if (e?.status === 401 && e?.data?.code === 'sso') toSiteLogin()
      else if (e?.data?.code === 'sso-taken') useUI.getState().toast(t('That Slippy Labs account already has its own profile here.'))
      else useUI.getState().toast(t('Could not link the account'))
    }
  }
  return <Row icon="personCircle" iconTint="var(--indigo)" title={t('Link my Slippy Labs account')} accessory="chevron"
    subtitle={t('Then signing in to slippylabs.com opens this profile on any device.')} onClick={link} />
}
