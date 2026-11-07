// TraceProof icon set — angular, chamfered, HUD-style strokes (24×24, currentColor).
const P = {
  overview: '<path d="M12 2.5 20.5 7.5v9L12 21.5 3.5 16.5v-9Z"/><path d="M12 8.2 15.3 10v4L12 15.8 8.7 14v-4Z"/><path d="M12 2.5v3M20.5 16.5l-2.6-1.5M3.5 16.5l2.6-1.5"/>',
  workbench: '<path d="M3 4h14l4 4v12H3Z"/><path d="m7 10 3 2.2L7 14.4M12.5 15H17"/>',
  runs: '<path d="M2 12h4l2.2-6 3.8 12 3-8.5 1.8 2.5H22"/><path d="M2 20h3M19 4h3" opacity=".55"/>',
  projects: '<path d="M12 3 21 8l-9 5-9-5Z"/><path d="m3 12.3 9 5 9-5M3 16.5l9 5 9-5"/>',
  platform: '<path d="M8 6h8l2 2v8l-2 2H8l-2-2V8Z"/><path d="M10 10h4v4h-4ZM9.5 2.5V6M14.5 2.5V6M9.5 18v3.5M14.5 18v3.5M2.5 9.5H6M2.5 14.5H6M18 9.5h3.5M18 14.5h3.5"/>',
  team: '<path d="M12 3.2 14 5v2.2L12 9l-2-1.8V5Z"/><path d="M5 15.2 7 17v2.2L5 21l-2-1.8V17ZM19 15.2l2 1.8v2.2L19 21l-2-1.8V17Z"/><path d="M11 9 6 15.2M13 9l5 6.2M7.5 18.2h9"/>',
  trust: '<path d="M12 2.5 20 5.5V12c0 4.6-3.3 8.1-8 9.5-4.7-1.4-8-4.9-8-9.5V5.5Z"/><path d="m8.4 12 2.6 2.6 4.8-5.2"/>',
  contact: '<path d="M12 13.5V21M8.5 21h7"/><path d="M12 9.2 13.8 11 12 12.8 10.2 11Z"/><path d="M8 7a5.6 5.6 0 0 0 0 8M16 7a5.6 5.6 0 0 1 0 8M5 4a9.8 9.8 0 0 0 0 14M19 4a9.8 9.8 0 0 1 0 14"/>',
  account: '<path d="M3.5 7.5v-4h4M16.5 3.5h4v4M20.5 16.5v4h-4M7.5 20.5h-4v-4"/><path d="M12 7.5 14.6 9v3L12 13.5 9.4 12V9Z"/><path d="M7.5 18c1-2.3 2.6-3.3 4.5-3.3s3.5 1 4.5 3.3"/>',
  search: '<path d="M10.5 3.5a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z"/><path d="m15.6 15.6 5.4 5.4M10.5 6.5v2M10.5 12.5v2M6.5 10.5h2M12.5 10.5h2"/>',
  upload: '<path d="M12 15V3.5M7 8.5l5-5 5 5"/><path d="M3 14.5V20h4l1-1h8l1 1h4v-5.5"/>',
  download: '<path d="M12 3.5V15M7 10l5 5 5-5"/><path d="M3 14.5V20h4l1-1h8l1 1h4v-5.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<path d="M4 10.5h3v3H4ZM10.5 10.5h3v3h-3ZM17 10.5h3v3h-3Z"/>',
  menu: '<path d="M3 6h18M3 12h12M3 18h18"/><path d="M18 11h3v2h-3Z"/>',
  play: '<path d="M7 4v16l13-8Z"/>',
  recenter: '<path d="M12 5a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/><path d="M12 10.5 13.5 12 12 13.5 10.5 12Z"/>',
  locate: '<path d="M12 21.5s-7-6.3-7-11.7a7 7 0 0 1 14 0c0 5.4-7 11.7-7 11.7Z"/><path d="M12 7.5 14.3 9.8 12 12.1 9.7 9.8Z"/>',
  drag: '<path d="M12 3v18M3 12h18"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  close: '<path d="m5 5 14 14M19 5 5 19"/>',
  database: '<path d="M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Z"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  chip: '<path d="M7 7h10v10H7Z"/><path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4"/>'
};

export const icon = (name, cls = '') => P[name] ? `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true" focusable="false">${P[name]}</svg>` : '';

// Replace every [data-icon] placeholder in the given root.
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => { if (!el.firstElementChild) el.innerHTML = icon(el.dataset.icon); });
}

export const LOGO_MARK = '<svg class="logo-mark" viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false"><path class="logo-frame" d="M6 2.5h15.5l8 8V29.5H2.5V6Z"/><path class="logo-trace" d="M6.5 18.5h5l2.4-6 4.2 10 2.6-6.5h4.8"/><path class="logo-node" d="M25.5 14.6 27.4 16.5 25.5 18.4 23.6 16.5Z"/></svg>';
