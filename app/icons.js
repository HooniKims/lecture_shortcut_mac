const glyphs = {
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  monitor:'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 21h8m-4-5v5"/>',
  settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  folder:'<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>', chevron:'<path d="m8 10 4 4 4-4"/>',
  play:'<path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>', panel:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M15 3v18M7 8h4m-4 4h4m-4 4h4"/>',
  check:'<path d="m5 12 4 4L19 6"/>', pin:'<path d="m9 3 6 0-1 6 4 4H6l4-4-1-6Zm3 10v8"/>',
  link:'<path d="m10 13 4-4m-6 7-2 2a4 4 0 0 1-6-6l4-4m12 0 2-2a4 4 0 0 0-6-6l-4 4" transform="translate(2 2) scale(.9)"/>',
  keyboard:'<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M6 9h1m3 0h1m3 0h1m3 0h0M6 13h1m3 0h1m3 0h1M7 16h10"/>',
  save:'<path d="M5 3h12l4 4v14H3V3h2Zm2 0v7h10V3M7 21v-7h10v7"/>',
  copy:'<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
  dot:'<circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/>',
  presentation:'<rect x="3" y="3" width="18" height="13" rx="2"/><path d="m8 21 4-5 4 5M7 8h10M7 12h5"/>',
  browser:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3h0m-4 9L5 6m11 6h5m-11 4-3 4"/>',
  video:'<rect x="3" y="5" width="18" height="14" rx="4"/><path d="m10 9 5 3-5 3Z" fill="currentColor" stroke="none"/>',
  code:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
  document:'<path d="M5 2h9l5 5v15H5ZM14 2v6h5M8 12h8m-8 4h6"/>',
  note:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8m-8 4h8m-8 4h5"/>'
};
function icon(name, className = '') { return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${glyphs[name] || glyphs.grid}</svg>`; }
function appIcon(item) { return `<span class="app-icon app-${item.icon}">${icon(item.icon)}</span>`; }
function keys(value) { return `<span class="key-combo">${value.split(' ').map(key => `<kbd class="${['⌘', '⌃', '⌥', '⇧'].includes(key) ? 'key-modifier' : 'key-trigger'}">${escapeText(key)}</kbd>`).join('<span class="key-separator">+</span>')}</span>`; }
function escapeText(value) { return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); }
