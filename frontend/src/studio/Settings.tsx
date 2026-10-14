import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Eye, EyeOff, KeyRound, PlugZap, Save, Trash2, XCircle } from 'lucide-react'
import { api } from '../api'
import { useApi } from '../shared/hooks'
import { Badge, Button, Card, ErrorState, Segmented, Skeleton, Spinner, inputCls } from '../shared/ui'
import { useTheme } from '../shared/theme'
import { SETTINGS_EVENT } from './ModelChip'
import { ModelPrices, OutsideData } from './SettingsExtras'

interface ProviderInfo { id: string; label: string; models: string[]; default_model: string; needs_key: boolean; uses_base_url: boolean; default_base_url: string | null; endpoint: string | null }
interface SettingsView {
  use_ai: boolean; provider: string; model: string; base_url: string | null; has_key: boolean; key_hint: string | null
  base_url_source: 'saved' | 'environment' | 'default'; base_urls: Record<string, string>
  tls_by_provider: Record<string, { mode: TlsMode; ca_bundle: string | null }>
  proxy: string | null; proxy_in_use: string | null; proxy_source: string
  key_source: 'saved' | 'environment' | 'none'; keys_saved: Record<string, boolean>; effective_mode: 'llm' | 'offline'
  providers: ProviderInfo[]; note: string
}
interface TestResult {
  ok: boolean; ssl?: boolean; details?: string; route?: { url: string | null; proxy: string | null; proxy_source: string; certificate_check: string }; error?: string; hint?: string | null; status?: number; latency_ms?: number; model?: string; reply?: string
  prompt_tokens?: number | null; completion_tokens?: number | null; supports_tools?: boolean | null
}

const CUSTOM = '__custom__'
type TlsMode = 'system' | 'custom' | 'off'

function Appearance() {
  const { pref, setPref, motion, setMotion, systemReducedMotion } = useTheme()
  return (
    <Card className="space-y-4 p-5">
      <div><h2 className="text-base font-semibold">Appearance</h2><p className="text-sm text-muted">Applies to the storefront and the back office on this browser.</p></div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="font-medium">Theme</span>
        <Segmented label="Theme" value={pref} onChange={setPref} options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} /></div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm"><span className="font-medium">Animations</span>
        <Segmented label="Animations" value={motion} onChange={setMotion} options={[{ value: 'system', label: 'Match device' }, { value: 'on', label: 'On' }, { value: 'off', label: 'Reduced' }]} /></div>
      {systemReducedMotion && motion === 'system' && (
        <p className="rounded-xl bg-ice p-3 text-xs text-muted">This device asks apps to reduce motion, so page transitions, chart growth and the agent-graph replay are toned down to simple fades. Choose <b className="text-ink">On</b> to see the full animations.</p>
      )}
    </Card>
  )
}

export default function Settings() {
  const { data, error, loading, reload } = useApi<SettingsView>('/settings')
  const [useAi, setUseAi] = useState(true)
  const [provider, setProvider] = useState('openrouter')
  const [modelSel, setModelSel] = useState('')
  const [customModel, setCustomModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [tlsMode, setTlsMode] = useState<TlsMode>('system')
  const [caBundle, setCaBundle] = useState('')
  const [proxy, setProxy] = useState('')
  const [token, setToken] = useState('')
  const [showToken, setShowToken] = useState(false)
  const [busy, setBusy] = useState<'test' | 'save' | 'clear' | null>(null)
  const [test, setTest] = useState<TestResult | null>(null)
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null)

  const info = useMemo(() => data?.providers.find(p => p.id === provider), [data, provider])
  const model = modelSel === CUSTOM ? customModel.trim() : modelSel

  const hydrate = (s: SettingsView) => {
    setUseAi(s.use_ai); setProvider(s.provider); setBaseUrl(s.base_urls[s.provider] ?? ''); setToken('')
    setTlsMode(s.tls_by_provider[s.provider]?.mode ?? 'system'); setCaBundle(s.tls_by_provider[s.provider]?.ca_bundle ?? ''); setProxy(s.proxy ?? '')
    const p = s.providers.find(x => x.id === s.provider)
    if (p?.models.includes(s.model)) { setModelSel(s.model); setCustomModel('') } else { setModelSel(CUSTOM); setCustomModel(s.model) }
  }
  useEffect(() => { if (data) hydrate(data) }, [data])

  const changeProvider = (id: string) => {
    const p = data!.providers.find(x => x.id === id)!
    setProvider(id); setToken(''); setTest(null); setMsg(null)
    setModelSel(p.models[0] ?? CUSTOM); setCustomModel(''); setBaseUrl(data!.base_urls[id] ?? '')  // each provider keeps its own URL
    setTlsMode(data!.tls_by_provider[id]?.mode ?? 'system'); setCaBundle(data!.tls_by_provider[id]?.ca_bundle ?? '')
  }

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (loading || !data || !info) return <Skeleton className="h-96" />

  const savedForProvider = data.keys_saved[provider]
  const hasKeyForProvider = !!token || (provider === data.provider && data.has_key) || savedForProvider
  const savedUrl = data.base_urls[provider] ?? ''
  const urlError = baseUrl.trim() && !/^https?:\/\/[^\s/?#@]+(\/[^\s?#]*)?$/i.test(baseUrl.trim()) ? 'Enter a full http:// or https:// address without spaces, ?query or user:password.' : null
  const savedTls = data.tls_by_provider[provider] ?? { mode: 'system', ca_bundle: null }
  const tlsDirty = tlsMode !== savedTls.mode || (tlsMode === 'custom' && caBundle.trim() !== (savedTls.ca_bundle ?? ''))
  const caError = tlsMode === 'custom' && !caBundle.trim() ? 'Enter the path to the CA certificate file.' : null
  const dirty = !!token || useAi !== data.use_ai || provider !== data.provider || model !== data.model || baseUrl.trim().replace(/\/+$/, '') !== savedUrl || tlsDirty || proxy.trim() !== (data.proxy ?? '')
  const proxyError = proxy.trim() && !/^https?:\/\/[^\s/]+/i.test(proxy.trim()) ? 'Enter the proxy as http://host:port.' : null
  const tlsBody = { tls_mode: tlsMode, ca_bundle: tlsMode === 'custom' ? caBundle.trim() : null, proxy: proxy.includes('***') ? undefined : proxy.trim() }
  const body = { use_ai: useAi, provider, model, base_url: baseUrl.trim() || null, api_key: token || null, ...tlsBody }

  async function runTest() {
    setBusy('test'); setTest(null); setMsg(null)
    try { setTest(await api<TestResult>('/settings/test', { method: 'POST', json: { provider, model, base_url: baseUrl.trim() || null, api_key: token || null, ...tlsBody } })) }
    catch (e) { setTest({ ok: false, error: (e as Error).message }) } finally { setBusy(null) }
  }
  async function save(clear = false) {
    setBusy(clear ? 'clear' : 'save'); setMsg(null)
    try {
      const s = await api<SettingsView>('/settings', { method: 'PUT', json: { ...body, clear_key: clear } })
      hydrate(s); reload(); window.dispatchEvent(new Event(SETTINGS_EVENT))
      setMsg({ tone: 'ok', text: clear ? 'Saved token removed.' : s.effective_mode === 'llm' ? 'Saved. New runs will use this model.' : 'Saved. The app will run in offline deterministic mode.' })
    } catch (e) { setMsg({ tone: 'bad', text: (e as Error).message }) } finally { setBusy(null) }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header>
        <h1 className="text-2xl font-bold md:text-3xl">Settings</h1>
        <p className="text-sm text-muted">Choose the language model used by the Campaign Brief and Insights agents. Filtering and ranking stay deterministic Python either way.</p>
      </header>
      <Appearance />

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4" >
        <div role="status" aria-live="polite" className="text-sm">
          Currently running in{' '}
          <b>{data.effective_mode === 'llm' ? `AI mode · ${data.provider} · ${data.model}` : 'offline deterministic mode (no LLM calls)'}</b>
          {data.effective_mode === 'llm' && <span className="text-muted"> · token from {data.key_source === 'none' ? 'no token needed' : data.key_source === 'saved' ? 'Settings' : 'environment'}</span>}
        </div>
        <Badge tone={data.effective_mode === 'llm' ? 'ok' : 'neutral'}>{data.effective_mode === 'llm' ? 'LLM active' : 'Offline'}</Badge>
      </Card>

      <Card className="space-y-5 p-5">
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[#01ABDD]" checked={useAi} onChange={e => { setUseAi(e.target.checked); setTest(null) }} />
          <span><b>Use an AI model</b><span className="block text-muted">Turn off to run fully offline: templated campaign insights and the rule-based chat router (no tokens used). Briefs and matching never need a model.</span></span>
        </label>

        <fieldset disabled={!useAi} className="space-y-4 disabled:opacity-50">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm"><span className="mb-1 block font-medium">Provider</span>
              <select className={inputCls} value={provider} onChange={e => changeProvider(e.target.value)}>
                {data.providers.map(p => <option key={p.id} value={p.id}>{p.label}{data.keys_saved[p.id] ? ' ✓ token saved' : ''}</option>)}
              </select></label>
            <label className="block text-sm"><span className="mb-1 block font-medium">Model</span>
              <select className={inputCls} value={modelSel} onChange={e => { setModelSel(e.target.value); setTest(null) }}>
                {info.models.map(m => <option key={m} value={m}>{m}</option>)}
                <option value={CUSTOM}>Custom model id…</option>
              </select></label>
          </div>
          {modelSel === CUSTOM && (
            <label className="block text-sm"><span className="mb-1 block font-medium">Custom model id</span>
              <input className={inputCls} value={customModel} onChange={e => { setCustomModel(e.target.value); setTest(null) }}
                placeholder={provider === 'custom' ? 'e.g. groq/llama-3.3-70b-versatile' : 'Model id as the provider names it'} />
              {provider === 'openrouter' && <span className="mt-1 block text-xs text-muted">Use OpenRouter’s id, for example <code>vendor/model:free</code>.</span>}
              {provider === 'custom' && <span className="mt-1 block text-xs text-muted">Full LiteLLM string including the provider prefix.</span>}</label>
          )}
          <label className="block text-sm">
            <span className="mb-1 flex flex-wrap items-center gap-2 font-medium">Base URL <span className="font-normal text-muted">(optional)</span>
              {provider === data.provider && data.base_url_source === 'environment' && !baseUrl && <Badge>from LLM_BASE_URL: {data.base_url}</Badge>}</span>
            <input className={`${inputCls} font-mono text-[13px] ${urlError ? 'border-red-400 focus:border-red-500' : ''}`} value={baseUrl} inputMode="url" spellCheck={false} autoComplete="off"
              aria-invalid={!!urlError} aria-describedby="base-url-help"
              onChange={e => { setBaseUrl(e.target.value); setTest(null) }} placeholder={info.endpoint ?? 'https://your-endpoint.example.com/v1'} />
            <span id="base-url-help" className={`mt-1 block text-xs ${urlError ? 'text-red-700 dark:text-red-300' : 'text-muted'}`}>
              {urlError ?? (info.endpoint
                ? <>Leave blank to use {info.label}'s standard endpoint (<code>{info.endpoint}</code>). Set it to route calls through a gateway, proxy, Azure deployment or self-hosted server. Saved for {info.label} only.</>
                : <>The address of your OpenAI-compatible server, for example <code>http://localhost:8000/v1</code>. Saved for this provider only.</>)}
            </span>
          </label>
          <fieldset className="space-y-2 text-sm">
            <legend className="mb-1 font-medium">Certificate check <span className="font-normal text-muted">(for HTTPS base URLs)</span></legend>
            {([['system', 'Windows certificates (recommended)', 'Trusts the certificates installed on this computer, including a company gateway\'s root certificate that IT installed.'],
               ['custom', 'Use a CA certificate file', 'Also trust a .pem, .crt or .cer file, for a gateway with a self-signed or private certificate.'],
               ['off', 'Off (not secure)', 'Skips the check entirely. Only for local testing: anyone on the network could intercept the token.']] as [TlsMode, string, string][]).map(([v, label, hint]) => (
              <label key={v} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 transition-colors ${tlsMode === v ? 'border-brand/50 bg-brand/5' : 'border-line hover:bg-ice'}`}>
                <input type="radio" name="tls-mode" className="mt-1 accent-[#01ABDD]" checked={tlsMode === v} onChange={() => { setTlsMode(v); setTest(null) }} />
                <span><span className={`font-medium ${v === 'off' ? 'text-amber-800 dark:text-amber-300' : ''}`}>{label}</span><span className="block text-xs text-muted">{hint}</span></span>
              </label>
            ))}
            {tlsMode === 'custom' && (
              <label className="block pl-1">
                <span className="mb-1 block text-xs font-medium">CA certificate file on this computer</span>
                <input className={`${inputCls} font-mono text-[13px]`} value={caBundle} spellCheck={false} autoComplete="off" onChange={e => { setCaBundle(e.target.value); setTest(null) }}
                  placeholder="C:\certs\company-root.pem" aria-invalid={!!caError} />
                <span className="mt-1 block text-xs text-muted">Export it from Windows (certmgr.msc &gt; the root certificate &gt; Export &gt; Base-64 .cer) or ask IT for the PEM file. The path is read by the server.</span>
              </label>
            )}
            {tlsMode === 'off' && <p role="alert" className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200">Certificate checking is off for {info.label}. Use this only to confirm the cause, then switch to Windows certificates or a CA file.</p>}
          </fieldset>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Proxy <span className="font-normal text-muted">(optional)</span></span>
            <input className={`${inputCls} font-mono text-[13px]`} value={proxy} spellCheck={false} autoComplete="off" aria-invalid={!!proxyError}
              onChange={e => { setProxy(e.target.value); setTest(null) }} placeholder={data.proxy_in_use ?? 'http://proxy.company.com:8080'} />
            <span className={`mt-1 block text-xs ${proxyError ? 'text-red-700 dark:text-red-300' : 'text-muted'}`}>
              {proxyError ?? <>Needed behind a company proxy. Blank uses the HTTPS_PROXY environment variable{data.proxy_in_use && !data.proxy ? <> (now <code>{data.proxy_in_use}</code>)</> : ' (none set)'}, like curl.</>}
            </span>
          </label>
          <label className="block text-sm">
            <span className="mb-1 flex items-center gap-2 font-medium"><KeyRound size={15} aria-hidden="true" />Access token{!info.needs_key && ' (optional)'}
              {hasKeyForProvider && !token && <Badge tone="ok">{provider === data.provider && data.key_hint ? `saved ${data.key_hint}${data.key_source === 'environment' ? ' (from environment)' : ''}` : 'saved'}</Badge>}</span>
            <span className="relative block">
              <input type={showToken ? 'text' : 'password'} autoComplete="off" spellCheck={false} className={`${inputCls} pr-10`} value={token} onChange={e => { setToken(e.target.value); setTest(null) }}
                placeholder={hasKeyForProvider ? 'Leave blank to keep the saved token' : info.needs_key ? 'Paste your access token' : 'Not required'} />
              <button type="button" onClick={() => setShowToken(v => !v)} aria-label={showToken ? 'Hide token' : 'Show token'} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink">
                {showToken ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}</button>
            </span>
            <span className="mt-1 block text-xs text-muted">{data.note}</span>
          </label>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={runTest} disabled={busy !== null || !useAi || !model || !!urlError || !!caError || !!proxyError || (info.needs_key && !hasKeyForProvider)}>
            {busy === 'test' ? <Spinner /> : <PlugZap size={16} aria-hidden="true" />}Test connection</Button>
          <Button onClick={() => save()} disabled={busy !== null || (useAi && !model) || !!urlError || !!caError || !!proxyError}>{busy === 'save' ? <Spinner /> : <Save size={16} aria-hidden="true" />}Save settings</Button>
          {savedForProvider && <Button variant="ghost" onClick={() => save(true)} disabled={busy !== null}><Trash2 size={16} aria-hidden="true" />Remove saved token</Button>}
        </div>
        {busy === 'test' && <p className="text-xs text-muted">Contacting the provider… free models can take up to a minute.</p>}

        {test && (
          <div role="status" aria-live="polite" className={`rounded-xl border p-4 text-sm ${test.ok ? 'border-emerald-200 dark:border-emerald-400/30 bg-emerald-50 dark:bg-emerald-400/10' : 'border-red-200 dark:border-red-400/30 bg-red-50 dark:bg-red-400/10'}`}>
            {test.ok ? (
              <div className="space-y-1">
                <p className="flex items-center gap-2 font-semibold text-emerald-900 dark:text-emerald-200"><CheckCircle2 size={18} aria-hidden="true" />Connection successful</p>
                <p className="text-emerald-900 dark:text-emerald-200">{test.model} answered in {((test.latency_ms ?? 0) / 1000).toFixed(1)}s{test.reply ? ` (“${test.reply}”)` : ''}
                  {test.prompt_tokens != null && ` · ${test.prompt_tokens} in / ${test.completion_tokens ?? 0} out tokens`}</p>
                {test.supports_tools === true && <p className="text-emerald-900 dark:text-emerald-200">Tool calling works, so the chat assistant can use this model.</p>}
                {test.supports_tools === false && <p className="text-amber-800 dark:text-amber-300">This model answered but did not call a tool, so the chat assistant will fall back to its rule-based router. Campaign insights can still use it.</p>}
                {test.supports_tools == null && <p className="text-amber-800 dark:text-amber-300">Tool calling could not be checked (the probe call failed). The chat assistant falls back to its rule-based router if needed.</p>}
                {!msg && dirty && <p className="text-xs text-emerald-900/80">Not saved yet: press “Save settings” to use it.</p>}
              </div>
            ) : (
              <div className="space-y-1">
                <p className="flex items-center gap-2 font-semibold text-red-900 dark:text-red-200"><XCircle size={18} aria-hidden="true" />{test.ssl ? 'SSL certificate problem' : `Connection failed${test.status ? ` (HTTP ${test.status})` : ''}`}</p>
                {test.hint && <p className="text-red-900 dark:text-red-200">{test.hint}</p>}
                {(test.details || test.route) && <details className="text-xs"><summary className="cursor-pointer text-red-900 dark:text-red-200">Technical details</summary>
                  {test.route && <p className="mt-1">URL: <code>{test.route.url ?? 'provider default'}</code> · proxy: <code>{test.route.proxy ?? 'none'}</code> ({test.route.proxy_source}) · certificate check: {test.route.certificate_check}</p>}
                  {test.details && <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px]">{test.details}</pre>}</details>}
                <p className="break-words text-xs text-red-900/80">{test.error}</p>
              </div>
            )}
          </div>
        )}
        {msg && <p role="status" className={`text-sm font-medium ${msg.tone === 'ok' ? 'text-emerald-800 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>{msg.text}</p>}
      </Card>
      <ModelPrices />
      <OutsideData />
    </div>
  )
}
