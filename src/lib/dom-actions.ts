// Runs inside the content script. Maintains the numbered snapshot of
// interactive elements that click_element / fill_form act on — the model
// references elements by index, never by CSS selector (selectors invented
// from extracted text are unreliable).

const MAX_ELEMENTS = 150;
const LABEL_MAX = 80;

interface Snapshot {
  url: string;
  elements: Element[];
}

let snapshot: Snapshot | null = null;

const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'textarea',
  'select',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="checkbox"]',
  '[role="menuitem"]',
  '[contenteditable="true"]',
].join(',');

function isVisible(el: Element): boolean {
  if (typeof (el as HTMLElement).checkVisibility === 'function') {
    return (el as HTMLElement).checkVisibility();
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function labelFor(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const text =
    el.getAttribute('aria-label') ||
    (el as HTMLInputElement).placeholder ||
    el.textContent?.trim() ||
    el.getAttribute('title') ||
    (el as HTMLInputElement).name ||
    '';
  const cleaned = text.replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX);

  if (tag === 'input') {
    const input = el as HTMLInputElement;
    const valueHint = input.value ? ` value="${input.value.slice(0, 30)}"` : '';
    return `<input type=${input.type || 'text'}>${valueHint} "${cleaned}"`;
  }
  if (tag === 'select') {
    const select = el as HTMLSelectElement;
    const options = Array.from(select.options)
      .slice(0, 10)
      .map((o) => o.value || o.text)
      .join(', ');
    return `<select> "${cleaned}" options: [${options}]`;
  }
  return `<${tag}> "${cleaned}"`;
}

export function getInteractiveElements(): { listing: string; count: number; url: string } {
  const all = Array.from(document.querySelectorAll(INTERACTIVE_SELECTOR)).filter(isVisible);
  const elements = all.slice(0, MAX_ELEMENTS);
  snapshot = { url: location.href, elements };

  const lines = elements.map((el, i) => `[${i}] ${labelFor(el)}`);
  if (all.length > MAX_ELEMENTS) {
    lines.push(`… ${all.length - MAX_ELEMENTS} more elements not listed.`);
  }
  return {
    listing: lines.join('\n') || 'No interactive elements found on this page.',
    count: elements.length,
    url: location.href,
  };
}

function getSnapshotElement(index: number): Element {
  if (!snapshot || snapshot.url !== location.href) {
    throw new Error(
      'No element snapshot for this page. Call get_interactive_elements first, then use the returned indices.',
    );
  }
  const el = snapshot.elements[index];
  if (!el) {
    throw new Error(`Index ${index} is out of range (snapshot has ${snapshot.elements.length} elements).`);
  }
  if (!el.isConnected) {
    throw new Error('That element is no longer on the page. Call get_interactive_elements again.');
  }
  return el;
}

export function clickElement(index: number): { result: string } {
  const el = getSnapshotElement(index);
  (el as HTMLElement).scrollIntoView({ block: 'center' });
  (el as HTMLElement).click();
  return { result: `Clicked [${index}] ${labelFor(el)}. If this triggered navigation or a UI change, call get_interactive_elements or read_page to see the new state.` };
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  // Go through the prototype's setter so frameworks (React) that patch the
  // instance property still see the change via the input event.
  const proto =
    el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

const OUTER_HTML_MAX = 4000;

function trimmedOuterHtml(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('script, style, svg path').forEach((child) => {
    child.remove();
  });
  const html = clone.outerHTML.replace(/\s+/g, ' ').replace(/> </g, '>\n<');
  return html.length > OUTER_HTML_MAX
    ? `${html.slice(0, OUTER_HTML_MAX)}\n… [truncated]`
    : html;
}

const STYLE_KEYS = [
  'display',
  'position',
  'width',
  'height',
  'margin',
  'padding',
  'border',
  'font-size',
  'font-family',
  'font-weight',
  'color',
  'background-color',
  'z-index',
  'overflow',
  'opacity',
  'visibility',
  'flex-direction',
  'grid-template-columns',
] as const;

export function inspectElement(options: { index?: number; selector?: string }): {
  report: string;
} {
  let el: Element;
  let matchNote = '';

  if (options.selector != null) {
    const matches = document.querySelectorAll(options.selector);
    if (matches.length === 0) {
      throw new Error(`No element matches selector "${options.selector}".`);
    }
    el = matches[0];
    if (matches.length > 1) matchNote = `\n(${matches.length} elements match — showing the first)`;
  } else if (options.index != null) {
    el = getSnapshotElement(options.index);
  } else {
    throw new Error('inspect_element requires either "index" or "selector".');
  }

  const computed = getComputedStyle(el);
  const styles = STYLE_KEYS.map((key) => `  ${key}: ${computed.getPropertyValue(key)}`).join('\n');
  const rect = el.getBoundingClientRect();
  const box = `x=${Math.round(rect.x)} y=${Math.round(rect.y)} w=${Math.round(rect.width)} h=${Math.round(rect.height)}`;

  return {
    report:
      `Element: <${el.tagName.toLowerCase()}>${matchNote}\n` +
      `Bounding box: ${box}\n\n` +
      `Computed styles:\n${styles}\n\n` +
      `HTML:\n${trimmedOuterHtml(el)}`,
  };
}

export function fillForm(index: number, value: string): { result: string } {
  const el = getSnapshotElement(index);
  (el as HTMLElement).scrollIntoView({ block: 'center' });
  (el as HTMLElement).focus();

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    setNativeValue(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (el instanceof HTMLSelectElement) {
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if ((el as HTMLElement).isContentEditable) {
    (el as HTMLElement).textContent = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    throw new Error(`Element [${index}] is not a fillable input.`);
  }

  return { result: `Filled [${index}] ${labelFor(el)} with "${value.slice(0, 60)}".` };
}
