import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { AudioLines, Cable, Check, Gauge, Radio, Router, ShieldAlert, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';

const queryClient = new QueryClient();
type Mode = 'demo' | 'local';
type Device = { connected: boolean; address: string | null; model: string | null };
type ProcessingSettings = {
  eq: { enabled: boolean | null; bands: { band: number; gainDb: number | null }[] } | null;
  compressor: { enabled: boolean | null; thresholdDb: number | null; ratio: number | null } | null;
};
type BridgeStatus = { mode: Mode; x32: Device; atem: Device; streamBus: { name: string; busNumber?: number | null; levelDb: number | null; mute: boolean | null; peakDbfs: number | null }; processing?: ProcessingSettings | null };
type ActionRequest = { action: 'set-level' | 'set-mute'; levelDb?: number; mute?: boolean };
type ProcessingAction =
  | { control: 'eq-enabled'; enabled: boolean }
  | { control: 'eq-gain'; band: number; gainDb: number }
  | { control: 'compressor-enabled'; enabled: boolean }
  | { control: 'compressor-threshold'; thresholdDb: number }
  | { control: 'compressor-ratio'; ratio: 1.1 | 1.3 | 1.5 | 2 | 2.5 | 3 | 4 | 5 };

const demoStatus: BridgeStatus = {
  mode: 'demo',
  x32: { connected: false, address: null, model: null },
  atem: { connected: false, address: null, model: null },
  streamBus: { name: 'Stream Bus', busNumber: null, levelDb: -18.4, mute: false, peakDbfs: -7.8 },
};

function isStatus(value: unknown): value is BridgeStatus {
  if (!value || typeof value !== 'object') return false;
  const s = value as BridgeStatus;
  return (s.mode === 'demo' || s.mode === 'local') && !!s.x32 && !!s.atem && !!s.streamBus;
}

function isLocalBridgeOrigin() {
  return window.location.protocol === 'http:' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') &&
    window.location.port === '4179';
}

function AppFrame({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <div className="console-shell">
    <header className="topbar">
      <Link href="/" className="brand" data-testid="link-home"><span className="brand-mark">SA</span><span>STREAM AUDIO CONTROL</span></Link>
      <nav className="topnav" aria-label="Primary navigation">
        <Link href="/" className={location === '/' ? 'active' : ''} data-testid="link-console">Console</Link>
        <Link href="/processing" className={location === '/processing' ? 'active' : ''} data-testid="link-processing">Processing</Link>
        <Link href="/setup" className={location === '/setup' ? 'active' : ''} data-testid="link-setup">Setup</Link>
      </nav>
      <div className="topright"><span>LOCAL OPERATOR CONSOLE</span><span className="live-clock">X32 / ATEM</span></div>
    </header>
    {children}
  </div>;
}

function useBridge() {
  const [status, setStatus] = useState<BridgeStatus>(demoStatus);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const refresh = useCallback(async () => {
    if (!isLocalBridgeOrigin()) {
      setStatus(demoStatus);
      setUnavailable(true);
      setError('');
      setLoading(false);
      return;
    }
    try {
      const response = await fetch('/bridge-api/status', { headers: { Accept: 'application/json' } });
      if (response.status === 404) {
        setStatus(demoStatus);
        setUnavailable(true);
        setError('');
        return;
      }
      if (!response.ok) throw new Error(`Bridge status returned ${response.status}`);
      const payload: unknown = await response.json();
      if (!isStatus(payload)) throw new Error('Bridge returned an unexpected status response.');
      setStatus(payload);
      setUnavailable(false);
      setError('');
    } catch (e) {
      setStatus(demoStatus);
      setUnavailable(true);
      setError(e instanceof Error ? e.message : 'Local bridge is unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const post = useCallback(async (path: string, body?: unknown) => {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`Request failed (${response.status}). Check that the local bridge is running.`);
    const text = await response.text();
    if (text) {
      try {
        const payload: unknown = JSON.parse(text);
        if (isStatus(payload)) setStatus(payload);
      } catch { /* Some bridge commands return an empty or plain-text acknowledgement. */ }
    }
    await refresh();
  }, [refresh]);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  }, []);

  return { status, loading, unavailable, error, refresh, post, toast, notify, setError };
}

function DeviceCard({ kind, device }: { kind: 'x32' | 'atem'; device: Device }) {
  const isX32 = kind === 'x32';
  const connected = device.connected;
  const Icon = isX32 ? AudioLines : Radio;
  const name = isX32 ? 'BEHRINGER X32' : 'ATEM TELEVISION STUDIO';
  return <section className="panel" data-testid={`device-${kind}`}>
    <div className="panel-head">
      <div className="panel-label"><span className="device-icon"><Icon size={15} /></span>{name}</div>
      <div className={`status-chip ${connected ? 'connected' : ''}`} data-testid={`status-${kind}`}><span className="status-led" />{connected ? 'Connected' : 'Disconnected'}</div>
    </div>
    <div className="device-body">
      <div><div className="device-model" data-testid={`value-${kind}-model`}>{connected ? device.model || (isX32 ? 'X32 digital mixer' : 'ATEM switcher') : 'No hardware link'}</div>
        <div className="device-address" data-testid={`value-${kind}-address`}>{connected ? device.address || 'Address not reported' : 'Address not connected'}</div></div>
      <div className="device-state">{connected ? <Check size={16} color="#338064" /> : <span>Awaiting link</span>}</div>
    </div>
  </section>;
}

function Confirmation({ action, mode, onCancel, onConfirm, busy }: { action: ActionRequest; mode: Mode; onCancel: () => void; onConfirm: () => void; busy: boolean }) {
  const label = action.action === 'set-level' ? `Set stream bus level to ${action.levelDb?.toFixed(1)} dB` : `${action.mute ? 'Mute' : 'Unmute'} stream bus`;
  return <div className="modal-backdrop" role="presentation">
    <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title" data-testid="dialog-confirm-action">
      <div className="eyebrow">Operator confirmation · {mode === 'demo' ? 'simulation only' : 'hardware command'}</div>
      <h2 id="confirm-title">Apply this change?</h2>
      <p>{mode === 'demo' ? 'This updates only the local demo display. No command will be sent to an X32 or other hardware.' : 'This sends a command to the connected local bridge. Confirm the target and value before applying.'}</p>
      <div className="confirm-details">{label}</div>
      <div className="button-row"><button className="btn btn-primary" onClick={onConfirm} disabled={busy} data-testid="button-confirm-change">{busy ? 'Applying…' : mode === 'demo' ? 'Confirm simulation' : 'Apply to hardware'}</button><button className="btn" onClick={onCancel} disabled={busy} data-testid="button-cancel-change">Cancel</button></div>
    </section>
  </div>;
}

function ConsolePage() {
  const bridge = useBridge();
  const [pending, setPending] = useState<ActionRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftLevel, setDraftLevel] = useState(-18.4);
  const [simulated, setSimulated] = useState({ levelDb: -18.4, mute: false });
  const demo = bridge.status.mode === 'demo';
  const busLevel = demo ? simulated.levelDb : bridge.status.streamBus.levelDb;
  const busMute = demo ? simulated.mute : bridge.status.streamBus.mute;
  const peak = demo ? -7.8 : bridge.status.streamBus.peakDbfs;
  const meterLevel = peak === null ? 0 : Math.max(0, Math.min(18, Math.round((peak + 60) / 3.4)));

  const apply = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (demo) {
        if (pending.action === 'set-level' && pending.levelDb !== undefined) setSimulated(v => ({ ...v, levelDb: pending.levelDb! }));
        if (pending.action === 'set-mute' && pending.mute !== undefined) setSimulated(v => ({ ...v, mute: pending.mute! }));
        bridge.notify('Demo simulation updated. Hardware was not changed.');
      } else {
        await bridge.post('/bridge-api/stream-bus', pending);
        bridge.notify('Command acknowledged by the local bridge.');
      }
      setPending(null);
    } catch (e) {
      bridge.setError(e instanceof Error ? e.message : 'Could not apply this command.');
      setPending(null);
    } finally { setBusy(false); }
  };

  return <AppFrame><main className="shell-content">
    <div className="header-row"><div><div className="eyebrow">Show control / audio</div><h1 className="page-title">Live console</h1><p className="page-subtitle">A clear read on the stream bus and the devices behind it.</p></div>
      <div className="mode-pill" data-testid="status-connection-mode"><span className="mode-dot" />{demo ? 'Demo mode · simulated' : 'Local hardware'}</div></div>
    {bridge.loading && <div className="loading-bar" aria-label="Loading bridge status" data-testid="status-loading" />}
    {demo && <div className="demo-notice" role="status" data-testid="status-demo-notice"><ShieldAlert size={17} /><div><strong>DEMO — NO HARDWARE LINK</strong><br />{bridge.unavailable ? 'The local bridge is not reachable from this browser. Values and controls below are simulation only.' : 'Demo values are illustrative. Any adjustment here changes this screen only, never the mixer.'}</div></div>}
    {!!bridge.error && <div className="error-banner" role="alert" data-testid="status-bridge-error"><span>{bridge.error}</span><button className="btn btn-quiet" onClick={() => void bridge.refresh()} data-testid="button-retry-status">Retry status</button></div>}
    <div className="device-grid"><DeviceCard kind="x32" device={bridge.status.x32} /><DeviceCard kind="atem" device={bridge.status.atem} /></div>
    <section className="panel bus-panel" data-testid="panel-stream-bus">
      <div className="panel-head"><div className="panel-label"><span className="device-icon"><SlidersHorizontal size={15} /></span><div><div>STREAM BUS</div><div className="eyebrow" style={{ marginTop: 3 }}>{bridge.status.streamBus.name || 'Stream Bus'}</div></div></div>
        <div className="status-chip" data-testid="status-bus-mute">{busMute === null ? 'Mute state unavailable' : busMute ? 'Muted' : 'Unmuted'}</div></div>
      <div className="bus-body">
        <div className="level-display"><div className="bus-name">Bus {demo ? '—' : bridge.status.streamBus.busNumber ?? '—'} level {demo && <span className="sim-label">Simulated</span>}</div>
          <div><span className="level-number" data-testid="value-bus-level">{busLevel === null ? 'UNAVAILABLE' : busLevel.toFixed(1)}</span>{busLevel !== null && <span className="level-unit">dB</span>}</div>
          <div className="peak-line" data-testid="value-bus-peak">PEAK · {peak === null ? 'UNAVAILABLE' : `${peak.toFixed(1)} dBFS`}{demo ? ' · SIM' : ''}</div></div>
        <div className="meter-wrap"><div className="meter-scale"><span>-60</span><span>-36</span><span>-18</span><span>-6</span><span>0 dBFS</span></div>
          <div className="meter-track" role="img" aria-label={`${demo ? 'Simulated ' : ''}stream bus meter, ${peak === null ? 'no meter data' : `${peak.toFixed(1)} dBFS`}`} data-testid="meter-stream-bus">
            {Array.from({ length: 18 }, (_, i) => <span className="meter-segment" key={i} />)}
            <div className="meter-dynamic">{Array.from({ length: 18 }, (_, i) => <span key={i} className={i < meterLevel && peak !== null && !busMute ? 'lit' : ''} />)}</div>
          </div>
          <div className="meter-scale"><span>LOW</span><span>{demo ? 'DEMO SAMPLE' : peak !== null ? 'LIVE READOUT' : 'METER UNAVAILABLE'}</span><span>PEAK</span></div></div>
        <div className="bus-controls">
          {demo && <span className="sim-label">SIMULATION ONLY</span>}
          <input type="range" className="level-slider" min="-60" max="10" step="0.5" value={draftLevel} aria-label="Proposed stream bus level" onChange={e => setDraftLevel(Number(e.target.value))} data-testid="input-bus-level" />
          <span className="level-range">{draftLevel.toFixed(1)} dB</span>
          <button className="btn btn-primary" onClick={() => setPending({ action: 'set-level', levelDb: draftLevel })} disabled={!demo && (!bridge.status.x32.connected || !bridge.status.streamBus.busNumber)} data-testid="button-set-level">Set level</button>
          <button className={`btn ${busMute ? 'btn-danger' : 'btn-dark'}`} onClick={() => setPending({ action: 'set-mute', mute: !busMute })} data-testid="button-toggle-mute" disabled={busMute === null || (!demo && (!bridge.status.x32.connected || !bridge.status.streamBus.busNumber))}>{busMute ? <><Volume2 size={13} /> Unmute</> : <><VolumeX size={13} /> Mute</>}</button>
        </div>
      </div>
    </section>
    <div className="bottom-grid" style={{ marginTop: 16 }}>
      <section className="panel connection-summary"><h2 className="summary-title">Connection readout</h2>
        <div className="summary-row"><span>Control path</span><span data-testid="value-control-path">{demo ? bridge.unavailable ? 'BRIDGE UNAVAILABLE · DEMO' : 'DEMO SIMULATION' : 'LOCAL BRIDGE'}</span></div>
        <div className="summary-row"><span>X32 link</span><span data-testid="value-x32-link">{bridge.status.x32.connected ? 'CONNECTED' : 'DISCONNECTED'}</span></div>
        <div className="summary-row"><span>ATEM link</span><span data-testid="value-atem-link">{bridge.status.atem.connected ? 'CONNECTED' : 'DISCONNECTED'}</span></div>
        <div className="summary-row"><span>Selected stream bus</span><span data-testid="value-selected-bus">{demo ? 'SIMULATED' : bridge.status.streamBus.busNumber ? `BUS ${bridge.status.streamBus.busNumber}` : 'NOT SELECTED'}</span></div>
        <div className="summary-row"><span>Hardware writes</span><span>{demo ? 'DISABLED IN DEMO' : 'CONFIRM EACH ACTION'}</span></div>
      </section>
      <section className="panel quick-actions"><h2 className="summary-title">Device setup</h2><p>Configure the local bridge and address each device on the operator network. The Replit preview cannot reach your physical LAN.</p>
        <div className="button-row"><Link href="/setup" className="btn btn-primary" data-testid="link-open-setup">Open setup</Link>{demo && <span className="sim-label">NO LIVE CONTROL</span>}</div>
      </section>
    </div>
    <div className="footer-note"><span>STREAM AUDIO CONTROL / LOCAL BRIDGE INTERFACE</span><span>STATUS REFRESHES EVERY 4 SEC · NO ATEM MIXER CONTROLS</span></div>
    {pending && <Confirmation action={pending} mode={bridge.status.mode} onCancel={() => setPending(null)} onConfirm={() => void apply()} busy={busy} />}
    {bridge.toast && <div className="toast-message" role="status" data-testid="status-toast">{bridge.toast}</div>}
  </main></AppFrame>;
}

function SetupPage() {
  const bridge = useBridge();
  const [x32Address, setX32Address] = useState('');
  const [atemAddress, setAtemAddress] = useState('');
  const [busNumber, setBusNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const demo = bridge.status.mode === 'demo';
  const connect = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    bridge.setError('');
    try {
      await bridge.post('/bridge-api/connect', { x32Address: x32Address.trim(), atemAddress: atemAddress.trim(), busNumber: Number(busNumber) });
      bridge.notify('Connection request sent for the selected bus. No mixer settings were written.');
    } catch (e) { bridge.setError(e instanceof Error ? e.message : 'Could not connect to the local bridge.'); }
    finally { setBusy(false); }
  };
  const disconnect = async () => {
    setBusy(true); bridge.setError('');
    try { await bridge.post('/bridge-api/disconnect'); bridge.notify('Local bridge disconnected.'); }
    catch (e) { bridge.setError(e instanceof Error ? e.message : 'Could not disconnect.'); }
    finally { setBusy(false); }
  };

  return <AppFrame><main className="shell-content">
    <div className="header-row"><div><div className="eyebrow">Operator configuration</div><h1 className="page-title">Bridge & device setup</h1><p className="page-subtitle">Connect through the local service running beside your show equipment.</p></div>
      <div className="mode-pill" data-testid="status-setup-mode"><span className="mode-dot" />{demo ? 'Demo · not connected' : 'Local hardware mode'}</div></div>
    {demo && <div className="setup-warning" data-testid="status-setup-demo"><strong>DEMO — THIS PREVIEW CANNOT REACH YOUR LAN.</strong> The browser preview is not running on the operator computer. Install and open the local bridge there to access the X32 and ATEM. Entering addresses here does not establish a hardware connection.</div>}
    {!!bridge.error && <div className="error-banner" role="alert" data-testid="status-setup-error"><span>{bridge.error}</span><button className="btn btn-quiet" onClick={() => void bridge.refresh()} data-testid="button-retry-setup">Retry status</button></div>}
    <div className="setup-layout">
      <section className="panel setup-panel"><div className="panel-head" style={{ margin: '-22px -22px 2px' }}><div className="panel-label"><span className="device-icon"><Cable size={15} /></span>GET THE LOCAL BRIDGE READY</div><span className="eyebrow">01 — 03</span></div>
        <div className="step"><span className="step-num">01</span><div><h3>Run the bridge on the operator computer</h3><p>Hardware access is provided by the local bridge service. Start it on the machine connected to your production network, then open this console from that same computer.</p></div></div>
        <div className="step"><span className="step-num">02</span><div><h3>Use device addresses on your show network</h3><p>Enter the X32 and ATEM IPv4 addresses below. Ensure the computer and devices share a reachable network and that device control is enabled.</p></div></div>
        <div className="step"><span className="step-num">03</span><div><h3>Confirm both links before the show</h3><p>Check that the console reports each device as connected. Connection requests do not write mixer settings; stream bus changes require a separate confirmation.</p></div></div>
        <div className="callout"><strong>Safety note</strong><br />A green connection state means the bridge reports a device link. It does not confirm the correctness of a show mix or switcher configuration.</div>
      </section>
      <section className="panel setup-panel"><div className="panel-head" style={{ margin: '-22px -22px 18px' }}><div className="panel-label"><span className="device-icon"><Router size={15} /></span>DEVICE ADDRESSING</div><span className={`status-chip ${!demo && bridge.status.x32.connected && bridge.status.atem.connected ? 'connected' : ''}`} data-testid="status-hardware-summary"><span className="status-led" />{!demo && bridge.status.x32.connected && bridge.status.atem.connected ? 'Both linked' : 'Not linked'}</span></div>
        <form className="address-form" onSubmit={connect}>
          <label><span className="field-label">Behringer X32 address</span><input className="field-input" placeholder="192.168.1.40" value={x32Address} onChange={e => setX32Address(e.target.value)} inputMode="decimal" data-testid="input-x32-address" /><span className="form-hint">IPv4 address of the mixer on your production LAN.</span></label>
          <label><span className="field-label">ATEM Television Studio address</span><input className="field-input" placeholder="192.168.1.50" value={atemAddress} onChange={e => setAtemAddress(e.target.value)} inputMode="decimal" data-testid="input-atem-address" /><span className="form-hint">Address for the connected ATEM Television Studio 4K-family switcher.</span></label>
          <label><span className="field-label">X32 stream bus</span><select className="field-input" value={busNumber} onChange={e => setBusNumber(e.target.value)} data-testid="select-stream-bus"><option value="">Choose bus 1–16</option>{Array.from({ length: 16 }, (_, index) => <option key={index + 1} value={index + 1}>Bus {index + 1}</option>)}</select><span className="form-hint">Choose the bus used for the stream. No bus is preselected.</span></label>
        <div className="form-hint">Fader targets are entered in dB; the local bridge converts approved values to the X32 linear OSC fader scale.</div>
        <div className="button-row"><button className="btn btn-primary" type="submit" disabled={busy || demo || !x32Address.trim() || !atemAddress.trim() || !busNumber} data-testid="button-connect">{busy ? 'Connecting…' : 'Connect devices'}</button>
            <button className="btn" type="button" disabled={busy || demo || (!bridge.status.x32.connected && !bridge.status.atem.connected)} onClick={() => void disconnect()} data-testid="button-disconnect">{busy ? 'Working…' : 'Disconnect'}</button></div>
        </form>
        <div className="callout"><strong>Connect only.</strong> This action requests device connections. It does not change levels, mute states, scenes, or ATEM settings.</div>
        <div className="footer-note"><span>BRIDGE STATUS</span><span data-testid="value-bridge-status">{bridge.loading ? 'CHECKING…' : bridge.unavailable ? 'UNAVAILABLE' : demo ? 'DEMO MODE' : 'LOCAL'}</span></div>
      </section>
    </div>
    <div className="footer-note"><span>LOCAL NETWORK ACCESS IS PROVIDED BY YOUR BRIDGE, NOT THIS PREVIEW.</span><span>DEVICE CONTROL IS LIMITED TO CONNECTION + STREAM BUS</span></div>
    {bridge.toast && <div className="toast-message" role="status" data-testid="status-setup-toast">{bridge.toast}</div>}
  </main></AppFrame>;
}

function ProcessingConfirm({ action, onCancel, onConfirm, busy }: { action: ProcessingAction; onCancel: () => void; onConfirm: () => void; busy: boolean }) {
  let description = '';
  switch (action.control) {
    case 'eq-enabled': description = `Set EQ ${action.enabled ? 'on' : 'off'}`; break;
    case 'eq-gain': description = `EQ band ${action.band} gain → ${action.gainDb.toFixed(2)} dB`; break;
    case 'compressor-enabled': description = `Set compressor ${action.enabled ? 'on' : 'off'}`; break;
    case 'compressor-threshold': description = `Compressor threshold → ${action.thresholdDb.toFixed(1)} dB`; break;
    case 'compressor-ratio': description = `Compressor ratio → ${action.ratio}:1`; break;
  }
  return <div className="modal-backdrop" role="presentation">
    <section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="processing-confirm-title" data-testid="dialog-confirm-processing">
      <div className="eyebrow">X32 stream bus · explicit processing write</div>
      <h2 id="processing-confirm-title">Confirm processing change</h2>
      <p>This sends one setting change to the selected, connected X32 stream bus. Nothing is written until you confirm.</p>
      <div className="confirm-details" data-testid="value-processing-pending">{description}</div>
      <div className="button-row"><button className="btn btn-primary" onClick={onConfirm} disabled={busy} data-testid="button-confirm-processing">{busy ? 'Applying…' : 'Apply to hardware'}</button><button className="btn" onClick={onCancel} disabled={busy} data-testid="button-cancel-processing">Cancel</button></div>
    </section>
  </div>;
}

function ProcessingPage() {
  const bridge = useBridge();
  const [pending, setPending] = useState<ProcessingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const usableBus = bridge.status.mode === 'local' && bridge.status.x32.connected && !!bridge.status.streamBus.busNumber;
  const processing = usableBus ? bridge.status.processing : null;
  const eq = processing?.eq ?? null;
  const compressor = processing?.compressor ?? null;
  const bands = Array.from({ length: 6 }, (_, index) => {
    const band = index + 1;
    return eq?.bands?.find(item => item.band === band) ?? { band, gainDb: null };
  });
  const applyProcessing = async () => {
    if (!pending || !usableBus) return;
    setBusy(true);
    try {
      await bridge.post('/bridge-api/processing', pending);
      bridge.notify('Processing change acknowledged by the local bridge.');
      setPending(null);
    } catch (e) {
      bridge.setError(e instanceof Error ? e.message : 'Could not apply processing change.');
      setPending(null);
    } finally { setBusy(false); }
  };
  const unavailable = !usableBus || !processing;
  const readyText = !usableBus
    ? bridge.status.mode === 'demo' ? 'DEMO MODE · HARDWARE PROCESSING UNAVAILABLE' : 'SELECTED X32 BUS NOT CONNECTED'
    : !processing ? 'PROCESSING FEEDBACK UNAVAILABLE' : 'LIVE SETTINGS · CONFIRM EACH WRITE';

  return <AppFrame><main className="shell-content">
    <div className="header-row"><div><div className="eyebrow">Selected X32 stream bus / processing</div><h1 className="page-title">EQ & compression</h1><p className="page-subtitle">Inspect current bus processing and make deliberate, confirmed changes.</p></div>
      <div className={`mode-pill ${usableBus ? 'local-pill' : ''}`} data-testid="status-processing-mode"><span className="mode-dot" />{readyText}</div></div>
    {bridge.loading && <div className="loading-bar" aria-label="Loading bridge status" data-testid="status-processing-loading" />}
    {bridge.status.mode === 'demo' && <div className="demo-notice" role="status" data-testid="status-processing-demo"><ShieldAlert size={17} /><div><strong>DEMO — PROCESSING UNAVAILABLE</strong><br />No simulated EQ or compressor values are shown. Connect the local bridge to a selected X32 stream bus to read and control its existing settings.</div></div>}
    {!!bridge.error && <div className="error-banner" role="alert" data-testid="status-processing-error"><span>{bridge.error}</span><button className="btn btn-quiet" onClick={() => void bridge.refresh()} data-testid="button-retry-processing">Retry status</button></div>}
    <div className="processing-context panel">
      <div className="context-cell"><span className="field-label">Hardware mode</span><strong data-testid="value-processing-connection">{bridge.status.mode === 'local' ? 'LOCAL BRIDGE' : 'DEMO ONLY'}</strong></div>
      <div className="context-cell"><span className="field-label">Selected bus</span><strong data-testid="value-processing-bus">{usableBus ? `BUS ${bridge.status.streamBus.busNumber}` : 'UNAVAILABLE'}</strong></div>
      <div className="context-cell"><span className="field-label">X32 connection</span><strong data-testid="value-processing-x32">{usableBus ? bridge.status.x32.model || 'CONNECTED' : 'UNAVAILABLE'}</strong></div>
      <div className="context-cell"><span className="field-label">Write policy</span><strong>CONFIRM EACH CHANGE</strong></div>
    </div>
    {unavailable && bridge.status.mode !== 'demo' && <div className="processing-unavailable" role="status" data-testid="status-processing-unavailable"><ShieldAlert size={16} /><span>{!usableBus ? 'The selected bus is not connected. Processing controls are disabled.' : 'The bridge has not confirmed processing feedback. No current values or write controls are available.'}</span></div>}
    <div className="processing-grid">
      <section className="panel processing-panel">
        <div className="panel-head"><div className="panel-label"><span className="device-icon"><SlidersHorizontal size={15} /></span><div><div>6-BAND EQ</div><div className="eyebrow" style={{ marginTop: 3 }}>Current X32 bus equalizer</div></div></div>
          <div className={`status-chip ${eq?.enabled !== null && eq?.enabled !== undefined && usableBus ? 'connected' : ''}`} data-testid="status-eq-enabled"><span className="status-led" />{usableBus && eq?.enabled !== null && eq?.enabled !== undefined ? eq.enabled ? 'Enabled' : 'Disabled' : 'Unavailable'}</div></div>
        <div className="processing-toggle-row"><div><strong>Equalizer</strong><span className="processing-subtext">{usableBus && eq?.enabled !== null && eq?.enabled !== undefined ? `Currently ${eq.enabled ? 'on' : 'off'}` : 'State unavailable'}</span></div>
          <button className={`toggle-button ${eq?.enabled ? 'is-on' : ''}`} role="switch" aria-checked={!!eq?.enabled} disabled={!usableBus || eq?.enabled === null || eq?.enabled === undefined} onClick={() => setPending({ control: 'eq-enabled', enabled: !eq?.enabled })} data-testid="button-toggle-eq">{usableBus && eq?.enabled !== null && eq?.enabled !== undefined ? eq.enabled ? 'Turn EQ off' : 'Turn EQ on' : 'Unavailable'}</button></div>
        <div className="band-list">
          {bands.map(({ band, gainDb }) => <BandGain key={band} band={band} gainDb={usableBus ? gainDb : null} disabled={!usableBus || gainDb === null} onApply={gain => setPending({ control: 'eq-gain', band, gainDb: gain })} />)}
        </div>
      </section>
      <section className="panel processing-panel">
        <div className="panel-head"><div className="panel-label"><span className="device-icon"><Gauge size={15} /></span><div><div>COMPRESSOR</div><div className="eyebrow" style={{ marginTop: 3 }}>Current X32 bus dynamics</div></div></div>
          <div className={`status-chip ${compressor?.enabled !== null && compressor?.enabled !== undefined && usableBus ? 'connected' : ''}`} data-testid="status-compressor-enabled"><span className="status-led" />{usableBus && compressor?.enabled !== null && compressor?.enabled !== undefined ? compressor.enabled ? 'Enabled' : 'Disabled' : 'Unavailable'}</div></div>
        <div className="processing-toggle-row"><div><strong>Compressor</strong><span className="processing-subtext">{usableBus && compressor?.enabled !== null && compressor?.enabled !== undefined ? `Currently ${compressor.enabled ? 'on' : 'off'}` : 'State unavailable'}</span></div>
          <button className={`toggle-button ${compressor?.enabled ? 'is-on' : ''}`} role="switch" aria-checked={!!compressor?.enabled} disabled={!usableBus || compressor?.enabled === null || compressor?.enabled === undefined} onClick={() => setPending({ control: 'compressor-enabled', enabled: !compressor?.enabled })} data-testid="button-toggle-compressor">{usableBus && compressor?.enabled !== null && compressor?.enabled !== undefined ? compressor.enabled ? 'Turn compressor off' : 'Turn compressor on' : 'Unavailable'}</button></div>
        <div className="compressor-field">
          <div className="processing-field-heading"><div><strong>Threshold</strong><span className="processing-subtext">Current: {usableBus && compressor?.thresholdDb !== null && compressor?.thresholdDb !== undefined ? `${compressor.thresholdDb.toFixed(1)} dB` : 'Unavailable'}</span></div><span className="mono value-chip">{usableBus && compressor?.thresholdDb !== null && compressor?.thresholdDb !== undefined ? `${compressor.thresholdDb.toFixed(1)} dB` : '—'}</span></div>
          <ThresholdControl current={usableBus ? compressor?.thresholdDb ?? null : null} disabled={!usableBus || compressor?.thresholdDb === null || compressor?.thresholdDb === undefined} onApply={thresholdDb => setPending({ control: 'compressor-threshold', thresholdDb })} />
          <div className="range-labels"><span>-40 dB</span><span>0 dB</span></div>
        </div>
        <div className="compressor-field ratio-field">
          <div className="processing-field-heading"><div><strong>Ratio</strong><span className="processing-subtext">Current: {usableBus && compressor?.ratio !== null && compressor?.ratio !== undefined ? `${compressor.ratio}:1` : 'Unavailable'}</span></div><span className="mono value-chip">{usableBus && compressor?.ratio !== null && compressor?.ratio !== undefined ? `${compressor.ratio}:1` : '—'}</span></div>
          <RatioControl current={usableBus ? compressor?.ratio ?? null : null} disabled={!usableBus || compressor?.ratio === null || compressor?.ratio === undefined} onApply={ratio => setPending({ control: 'compressor-ratio', ratio })} />
        </div>
      </section>
    </div>
    <div className="footer-note"><span>X32 SELECTED BUS PROCESSING / NO PRESETS</span><span>ATEM CONTROL IS NOT AVAILABLE HERE</span></div>
    {pending && <ProcessingConfirm action={pending} onCancel={() => setPending(null)} onConfirm={() => void applyProcessing()} busy={busy} />}
    {bridge.toast && <div className="toast-message" role="status" data-testid="status-processing-toast">{bridge.toast}</div>}
  </main></AppFrame>;
}

function BandGain({ band, gainDb, disabled, onApply }: { band: number; gainDb: number | null; disabled: boolean; onApply: (value: number) => void }) {
  const [draft, setDraft] = useState(gainDb ?? 0);
  useEffect(() => { if (gainDb !== null) setDraft(gainDb); }, [gainDb]);
  const changed = gainDb !== null && Math.abs(draft - gainDb) > 0.001;
  return <div className="band-row" data-testid={`row-eq-band-${band}`}>
    <div className="band-index"><span className="mono">0{band}</span><span>Band {band}</span></div>
    <input type="range" min="-6" max="6" step="0.25" value={draft} disabled={disabled} onChange={event => setDraft(Number(event.target.value))} aria-label={`EQ band ${band} gain`} data-testid={`input-eq-band-${band}`} />
    <span className="mono band-value" data-testid={`value-eq-band-${band}`}>{disabled || gainDb === null ? 'UNAVAILABLE' : `${gainDb.toFixed(2)} dB`}</span>
    <button className="btn btn-quiet band-apply" disabled={disabled || !changed} onClick={() => onApply(draft)} data-testid={`button-apply-eq-band-${band}`}>Review</button>
  </div>;
}

function ThresholdControl({ current, disabled, onApply }: { current: number | null; disabled: boolean; onApply: (value: number) => void }) {
  const [draft, setDraft] = useState(current ?? -18);
  useEffect(() => { if (current !== null) setDraft(current); }, [current]);
  const changed = current !== null && Math.abs(draft - current) > 0.001;
  return <div className="processing-adjust"><input type="range" min="-40" max="0" step="0.5" value={draft} disabled={disabled} aria-label="Compressor threshold" onChange={event => setDraft(Number(event.target.value))} data-testid="input-compressor-threshold" />
    <button className="btn btn-quiet band-apply" disabled={disabled || !changed} onClick={() => onApply(draft)} data-testid="button-apply-compressor-threshold">Review</button></div>;
}

function RatioControl({ current, disabled, onApply }: { current: number | null; disabled: boolean; onApply: (value: 1.1 | 1.3 | 1.5 | 2 | 2.5 | 3 | 4 | 5) => void }) {
  const choices = [1.1, 1.3, 1.5, 2, 2.5, 3, 4, 5] as const;
  const [draft, setDraft] = useState(current === null ? '' : String(current));
  useEffect(() => { if (current !== null) setDraft(String(current)); }, [current]);
  const changed = current !== null && draft !== '' && Number(draft) !== current;
  return <div className="processing-adjust"><select className="field-input ratio-select" value={draft} disabled={disabled} aria-label="Compressor ratio" onChange={event => setDraft(event.target.value)} data-testid="select-compressor-ratio">
    <option value="">Unavailable</option>{choices.map(ratio => <option key={ratio} value={ratio}>{ratio}:1</option>)}
  </select><button className="btn btn-quiet band-apply" disabled={disabled || !changed} onClick={() => { if (choices.includes(Number(draft) as typeof choices[number])) onApply(Number(draft) as typeof choices[number]); }} data-testid="button-apply-compressor-ratio">Review</button></div>;
}

function RouterView() {
  return <ErrorBoundary><Switch><Route path="/" component={ConsolePage} /><Route path="/processing" component={ProcessingPage} /><Route path="/setup" component={SetupPage} /><Route component={NotFound} /></Switch></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><RouterView /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
