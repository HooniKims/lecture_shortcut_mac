(() => {
  if (window.__auditRunning) throw new Error('A native memory audit is already running');
  window.__auditRunning = true;
  const started = Date.now();
  const audit = { runId: started, cycles: 0, nodes: [], done: false };
  const refs = [];
  window.__audit = audit;
  document.title = JSON.stringify(audit);
  window.__auditRun = (async () => {
    for (let i = 0; i < 2000; i++) {
      if (i < 1000) refs.push(new WeakRef(root.firstElementChild));
      const next = structuredClone(config);
      next.settings.theme = i % 2 ? 'studio' : 'paper';
      await save(next);
      if (config.settings.theme !== next.settings.theme) throw new Error('Stale theme at ' + i);
      audit.cycles++;
      if (i % 500 === 499) audit.nodes.push(document.querySelectorAll('*').length);
    }
    audit.retainedFirstGeneration = refs.filter(ref => ref.deref()).length;
    audit.elapsedMs = Date.now() - started;
    audit.done = true;
  })().catch(error => { audit.error = String(error); }).finally(() => {
    window.__auditRunning = false;
    document.title = JSON.stringify(audit);
  });
  return 'started';
})();
