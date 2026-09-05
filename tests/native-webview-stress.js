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
    await settingsDialog();
    dialog.querySelector('[data-action="close-dialog"]').click();
    audit.closedChildren = dialog.childElementCount;
    if (dialog.open || audit.closedChildren) throw new Error('Closed dialog retained DOM');
    showDialog('Audit reopen', '<p>Keep this form</p>', async () => {});
    await new Promise(resolve => setTimeout(resolve, 100));
    audit.reopenedIntact = dialog.open && dialog.querySelector('h2')?.textContent === 'Audit reopen';
    if (!audit.reopenedIntact) throw new Error('Delayed close erased reopened form');
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    if (dialog.open || dialog.childElementCount) throw new Error('Cancelled dialog retained DOM');
    audit.elapsedMs = Date.now() - started;
    audit.done = true;
  })().catch(error => { audit.error = String(error); }).finally(() => {
    window.__auditRunning = false;
    document.title = JSON.stringify(audit);
  });
  return 'started';
})();
