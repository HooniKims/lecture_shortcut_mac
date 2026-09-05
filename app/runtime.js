// One subscription lifetime per webview. Dialog listeners live on disposable DOM nodes.
const pageEvents = new AbortController();
const eventCleanups = [];
let refreshPending = null, refreshAgain = false, lastState = '', runtimeDisposed = false;
let displayTimer = null;
function on(target, event, handler) {
  target.addEventListener(event, handler, { signal: pageEvents.signal });
}
async function subscribe(event, handler) {
  const stop = await api.event.listen(event, handler);
  if (runtimeDisposed) stop(); else eventCleanups.push(stop);
}
function disposeRuntime() {
  runtimeDisposed = true;
  pageEvents.abort();
  clearTimeout(displayTimer);
  clearTimeout(notice.timer);
  for (const stop of eventCleanups.splice(0)) stop();
}
window.addEventListener('pagehide', disposeRuntime, { once: true });
async function refresh(invalidate = false) {
  if (refreshPending) {
    if (invalidate) refreshAgain = true;
    return refreshPending;
  }
  refreshPending = (async () => {
    do {
      refreshAgain = false;
      const state = await invoke('get_state');
      if (runtimeDisposed) return;
      // A change during this request may make its snapshot stale. Read once more.
      if (refreshAgain) continue;
      const signature = JSON.stringify(state);
      if (signature === lastState) return;
      lastState = signature;
      config = state.config; prepared = state.prepared;
      if (state.displays) displays = state.displays;
      document.documentElement.dataset.theme = config.settings.theme || 'studio';
      if (!config.entries.some(e => e.id === selected)) selected = config.entries[0]?.id || null;
      if (state.startupError && !startupShown) { startupShown = true; notice(state.startupError); }
      render();
    } while (refreshAgain);
  })().finally(() => { refreshPending = null; });
  return refreshPending;
}
function updateDisplays(next) {
  if (JSON.stringify(next) === JSON.stringify(displays)) return;
  displays = next;
  render();
  const standby = dialog.querySelector('input[name="standby"]');
  if (standby) { standby.disabled = displays.length < 2; if (standby.disabled) standby.checked = false; }
}
async function pollDisplays() {
  if (displayPolling || runtimeDisposed) return;
  displayPolling = true;
  try { const reply = await invoke('refresh_displays'); if (!runtimeDisposed) updateDisplays(reply.displays || []); }
  catch (error) { if (!displays.length) notice(error); }
  finally { displayPolling = false; }
}
async function scheduleDisplayCheck() {
  await pollDisplays();
  if (!runtimeDisposed) displayTimer = setTimeout(scheduleDisplayCheck, 3000);
}
async function boot() {
  if (!api) { root.innerHTML = '<div class="empty"><h1>Cue 앱에서 열어 주세요</h1><p>이 화면은 설치된 macOS 앱에서 실제 창과 연결됩니다.</p></div>'; return; }
  await subscribe('recorded-shortcut', event => { const field = document.activeElement; if (field.matches('[data-hotkey]')) { field.value = event.payload; updateShortcutPreview(field); } });
  await subscribe('changed', () => refresh(true).catch(notice));
  await subscribe('displays-changed', event => updateDisplays(event.payload));
  await subscribe('notice', event => notice(event.payload));
  await subscribe('action', event => {
    active = event.payload.outcome === 'minimized' ? null : event.payload.id;
    updatePads();
  });
  if (!isPanel) await subscribe('captured', event => addDialog(event.payload).catch(notice));
  await refresh();
  if (!isPanel) void scheduleDisplayCheck();
}
