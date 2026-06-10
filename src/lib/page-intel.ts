// Runs inside the content script (isolated world). Detection relies on DOM
// artifacts only — page-script globals like window.__NEXT_DATA__ are not
// visible across the isolated-world boundary, but the DOM they leave behind is.

interface TechRule {
  name: string;
  category: string;
  /** Returns evidence text when detected, null otherwise. */
  detect: () => string | null;
}

function hasSelector(selector: string): string | null {
  return document.querySelector(selector) ? `selector ${selector}` : null;
}

function assetMatch(pattern: RegExp): string | null {
  const nodes = document.querySelectorAll<HTMLElement>('script[src], link[href]');
  for (const node of nodes) {
    const url = node.getAttribute('src') ?? node.getAttribute('href') ?? '';
    if (pattern.test(url)) return url.slice(0, 120);
  }
  return null;
}

function inlineScriptMatch(pattern: RegExp): string | null {
  for (const script of document.querySelectorAll('script:not([src])')) {
    if (pattern.test(script.textContent ?? '')) return 'inline script';
  }
  return null;
}

const TECH_RULES: TechRule[] = [
  // Frameworks / meta-frameworks
  { name: 'Next.js', category: 'Framework', detect: () => hasSelector('script#__NEXT_DATA__') ?? hasSelector('#__next') ?? assetMatch(/\/_next\//) },
  { name: 'Nuxt', category: 'Framework', detect: () => hasSelector('#__nuxt') ?? assetMatch(/\/_nuxt\//) },
  { name: 'Gatsby', category: 'Framework', detect: () => hasSelector('#___gatsby') },
  { name: 'Remix', category: 'Framework', detect: () => inlineScriptMatch(/__remixContext/) },
  { name: 'SvelteKit / Svelte', category: 'Framework', detect: () => hasSelector('[class*="svelte-"]') ?? inlineScriptMatch(/__sveltekit/) },
  { name: 'Angular', category: 'Framework', detect: () => hasSelector('[ng-version]') },
  { name: 'Vue', category: 'Framework', detect: () => hasSelector('[data-v-app]') ?? hasSelector('[data-server-rendered]') ?? assetMatch(/vue(\.runtime)?(\.global)?(\.prod)?(\.min)?\.js/) },
  { name: 'React', category: 'Framework', detect: () => hasSelector('[data-reactroot]') ?? assetMatch(/react(-dom)?[.@][^/]*(\.min)?\.js/) },
  { name: 'Ember', category: 'Framework', detect: () => hasSelector('.ember-view') },
  { name: 'htmx', category: 'Framework', detect: () => hasSelector('[hx-get], [hx-post]') ?? assetMatch(/htmx(\.min)?\.js/) },
  // Platforms / CMS
  { name: 'WordPress', category: 'CMS / platform', detect: () => assetMatch(/\/wp-(content|includes)\//) ?? metaGenerator(/wordpress/i) },
  { name: 'Shopify', category: 'CMS / platform', detect: () => assetMatch(/cdn\.shopify\.com/) },
  { name: 'Wix', category: 'CMS / platform', detect: () => metaGenerator(/wix/i) ?? assetMatch(/static\.parastorage\.com/) },
  { name: 'Squarespace', category: 'CMS / platform', detect: () => assetMatch(/squarespace/) },
  { name: 'Webflow', category: 'CMS / platform', detect: () => metaGenerator(/webflow/i) ?? hasSelector('html[data-wf-site]') },
  { name: 'Drupal', category: 'CMS / platform', detect: () => metaGenerator(/drupal/i) },
  { name: 'Ghost', category: 'CMS / platform', detect: () => metaGenerator(/ghost/i) },
  { name: 'Docusaurus', category: 'CMS / platform', detect: () => metaGenerator(/docusaurus/i) },
  // CSS / UI
  { name: 'Tailwind CSS', category: 'CSS', detect: detectTailwind },
  { name: 'Bootstrap', category: 'CSS', detect: () => assetMatch(/bootstrap[^/]*\.css/) },
  // Libraries
  { name: 'jQuery', category: 'Library', detect: () => assetMatch(/jquery[^/]*\.js/i) },
  // Analytics / tags
  { name: 'Google Tag Manager', category: 'Analytics', detect: () => assetMatch(/googletagmanager\.com/) ?? inlineScriptMatch(/googletagmanager|dataLayer/) },
  { name: 'Google Analytics', category: 'Analytics', detect: () => assetMatch(/google-analytics\.com|gtag\/js/) },
  { name: 'Plausible', category: 'Analytics', detect: () => assetMatch(/plausible\.io/) },
  { name: 'Hotjar', category: 'Analytics', detect: () => assetMatch(/hotjar\.com/) ?? inlineScriptMatch(/hotjar/) },
  { name: 'Segment', category: 'Analytics', detect: () => inlineScriptMatch(/analytics\.load\(/) },
  // Infra hints
  { name: 'Cloudflare (assets/beacon)', category: 'Infrastructure', detect: () => assetMatch(/cloudflareinsights\.com|cdnjs\.cloudflare\.com/) },
  { name: 'Vercel (asset paths)', category: 'Infrastructure', detect: () => assetMatch(/\/_vercel\//) },
  { name: 'Netlify (asset paths)', category: 'Infrastructure', detect: () => assetMatch(/\.netlify\./) },
];

function metaGenerator(pattern: RegExp): string | null {
  const content = document
    .querySelector<HTMLMetaElement>('meta[name="generator" i]')
    ?.content?.trim();
  return content && pattern.test(content) ? `meta generator "${content}"` : null;
}

function detectTailwind(): string | null {
  // Heuristic: utility-class clusters on real elements.
  const sample = document.querySelectorAll('[class]');
  let hits = 0;
  let inspected = 0;
  for (const el of sample) {
    if (inspected++ > 400) break;
    const cls = el.getAttribute('class') ?? '';
    if (/(^|\s)(flex|grid|px-\d|py-\d|mt-\d|text-(xs|sm|lg|xl)|bg-\w+-\d{2,3}|rounded(-\w+)?)(\s|$)/.test(cls)) {
      if (++hits >= 8) return 'utility class patterns';
    }
  }
  return null;
}

export function getPageTech(): { report: string; url: string } {
  const findings = new Map<string, string[]>();
  for (const rule of TECH_RULES) {
    let evidence: string | null = null;
    try {
      evidence = rule.detect();
    } catch {
      // A rule failing must not kill the report.
    }
    if (evidence) {
      const list = findings.get(rule.category) ?? [];
      list.push(`${rule.name} (${evidence})`);
      findings.set(rule.category, list);
    }
  }

  const generator = document.querySelector<HTMLMetaElement>('meta[name="generator" i]')?.content;
  const lines: string[] = [];
  for (const [category, items] of findings) {
    lines.push(`${category}:`);
    for (const item of items) lines.push(`  - ${item}`);
  }
  if (generator && ![...findings.values()].flat().some((i) => i.includes(generator))) {
    lines.push(`Generator meta tag: ${generator}`);
  }

  return {
    url: location.href,
    report:
      lines.length > 0
        ? `Technology fingerprint (heuristic, based on DOM/asset evidence):\n${lines.join('\n')}`
        : 'No recognizable framework, CMS, or analytics fingerprints found — the site may be custom-built, server-rendered without client frameworks, or hiding its stack.',
  };
}

export function getPageMetadata(): { report: string; url: string } {
  const meta = (name: string) =>
    document.querySelector<HTMLMetaElement>(
      `meta[name="${name}" i], meta[property="${name}" i]`,
    )?.content;

  const jsonLdTypes: string[] = [];
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent ?? '');
      for (const node of Array.isArray(parsed) ? parsed : [parsed]) {
        const type = node?.['@type'];
        if (type) jsonLdTypes.push(...(Array.isArray(type) ? type : [type]));
      }
    } catch {
      // Malformed JSON-LD is common; skip.
    }
  }

  const fields: Array<[string, string | undefined | null]> = [
    ['Title', document.title],
    ['Description', meta('description') ?? meta('og:description')],
    ['Author', meta('author') ?? meta('article:author')],
    ['Published', meta('article:published_time') ?? meta('date')],
    ['Site name', meta('og:site_name')],
    ['OG type', meta('og:type')],
    ['Canonical URL', document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href],
    ['Language', document.documentElement.lang || undefined],
    ['Generator', meta('generator')],
    ['JSON-LD types', jsonLdTypes.length ? [...new Set(jsonLdTypes)].join(', ') : undefined],
    ['RSS/Atom feed', document.querySelector<HTMLLinkElement>('link[type*="rss"], link[type*="atom"]')?.href],
    ['Approx. word count', String((document.body?.innerText ?? '').split(/\s+/).length)],
  ];

  const lines = fields.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  return { url: location.href, report: lines.join('\n') };
}

export function findInPage(query: string): { result: string } {
  const needle = query.trim().toLowerCase();
  if (!needle) return { result: 'Empty search query.' };

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  const matches: Array<{ element: HTMLElement; context: string }> = [];
  let node: Node | null;
  while ((node = walker.nextNode()) && matches.length < 5) {
    const text = node.textContent ?? '';
    const index = text.toLowerCase().indexOf(needle);
    if (index === -1) continue;
    const element = node.parentElement!;
    const start = Math.max(0, index - 60);
    const context = text.slice(start, index + needle.length + 60).replace(/\s+/g, ' ').trim();
    matches.push({ element, context: `…${context}…` });
  }

  if (matches.length === 0) {
    return { result: `No matches for "${query}" in the visible page text.` };
  }

  const first = matches[0].element;
  first.scrollIntoView({ block: 'center' });
  const previousOutline = first.style.outline;
  first.style.outline = '2px solid #f59e0b';
  setTimeout(() => {
    first.style.outline = previousOutline;
  }, 2000);

  return {
    result:
      `Found ${matches.length}${matches.length === 5 ? '+' : ''} match(es) for "${query}". ` +
      `Scrolled to the first one.\n` +
      matches.map((m, i) => `[${i + 1}] ${m.context}`).join('\n'),
  };
}

export function scrollPage(direction: 'up' | 'down' | 'top' | 'bottom'): { result: string } {
  const step = window.innerHeight * 0.85;
  switch (direction) {
    case 'up':
      window.scrollBy({ top: -step });
      break;
    case 'down':
      window.scrollBy({ top: step });
      break;
    case 'top':
      window.scrollTo({ top: 0 });
      break;
    case 'bottom':
      window.scrollTo({ top: document.documentElement.scrollHeight });
      break;
  }
  const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  const percent = Math.round((Math.min(window.scrollY, max) / max) * 100);
  return {
    result: `Scrolled ${direction}. Viewport is now at ~${percent}% of the page. Use screenshot or read_page to see the content.`,
  };
}
