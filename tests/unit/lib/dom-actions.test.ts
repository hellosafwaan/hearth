// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clickElement,
  fillForm,
  getInteractiveElements,
  inspectElement,
} from '../../../src/lib/dom-actions';

// happy-dom has no layout engine, so checkVisibility/getBoundingClientRect
// report nothing as visible. Treat everything except [hidden] as visible —
// the visibility *predicate* is the browser's job; we test the logic around it.
beforeEach(() => {
  (HTMLElement.prototype as any).checkVisibility = function (this: HTMLElement) {
    return !this.hidden;
  };
  document.body.innerHTML = '';
});

function setBody(html: string) {
  document.body.innerHTML = html;
}

describe('getInteractiveElements', () => {
  it('lists buttons, links, inputs, selects, and contenteditable with indices', () => {
    setBody(`
      <a href="/docs">Docs</a>
      <button>Save</button>
      <input type="email" placeholder="Email" />
      <select><option value="a">A</option></select>
      <div contenteditable="true">note</div>
    `);

    const { listing, count } = getInteractiveElements();

    expect(count).toBe(5);
    expect(listing).toContain('[0] <a> "Docs"');
    expect(listing).toContain('[1] <button> "Save"');
    expect(listing).toContain('<input type=email> "Email"');
    expect(listing).toContain('<select>');
  });

  it('excludes hidden elements', () => {
    setBody('<button hidden>Ghost</button><button>Real</button>');
    const { listing, count } = getInteractiveElements();
    expect(count).toBe(1);
    expect(listing).not.toContain('Ghost');
  });
});

describe('clickElement / fillForm snapshot discipline', () => {
  it('requires a snapshot before acting', () => {
    setBody('<button>Save</button>');
    // No getInteractiveElements call on this "page" (fresh URL state is shared,
    // so take the snapshot then ask for an out-of-range index instead).
    getInteractiveElements();
    expect(() => clickElement(99)).toThrow(/out of range/);
  });

  it('rejects elements that left the DOM with a re-scan hint', () => {
    setBody('<button>Save</button>');
    getInteractiveElements();
    document.body.innerHTML = '';
    expect(() => clickElement(0)).toThrow(/no longer on the page/);
  });

  it('clicks by index and reports the action', () => {
    setBody('<button>Save</button>');
    let clicked = false;
    document.querySelector('button')!.addEventListener('click', () => {
      clicked = true;
    });
    getInteractiveElements();

    const { result } = clickElement(0);

    expect(clicked).toBe(true);
    expect(result).toContain('Clicked [0]');
  });
});

describe('fillForm', () => {
  it('fills inputs and dispatches input/change events', () => {
    setBody('<input type="text" placeholder="Name" />');
    const input = document.querySelector('input')!;
    const events: string[] = [];
    input.addEventListener('input', () => events.push('input'));
    input.addEventListener('change', () => events.push('change'));
    getInteractiveElements();

    fillForm(0, 'Safwaan');

    expect(input.value).toBe('Safwaan');
    expect(events).toEqual(['input', 'change']);
  });

  it('fills selects and contenteditable', () => {
    setBody(`
      <select><option value="a">A</option><option value="b">B</option></select>
      <div contenteditable="true"></div>
    `);
    getInteractiveElements();

    fillForm(0, 'b');
    fillForm(1, 'hello');

    expect(document.querySelector('select')!.value).toBe('b');
    expect(document.querySelector('div')!.textContent).toBe('hello');
  });

  it('refuses non-fillable elements', () => {
    setBody('<a href="/x">link</a>');
    getInteractiveElements();
    expect(() => fillForm(0, 'nope')).toThrow(/not a fillable input/);
  });
});

describe('inspectElement', () => {
  it('reports tag, box, styles, and trimmed HTML by selector', () => {
    setBody('<button id="cta" style="color: red">Buy<script>evil()</script></button>');

    const { report } = inspectElement({ selector: '#cta' });

    expect(report).toContain('Element: <button>');
    expect(report).toContain('Bounding box:');
    expect(report).toContain('Computed styles:');
    expect(report).toContain('Buy');
    expect(report).not.toContain('evil()'); // scripts stripped from the HTML dump
  });

  it('errors on selectors with no match', () => {
    setBody('<div></div>');
    expect(() => inspectElement({ selector: '#missing' })).toThrow(/No element matches/);
  });

  it('requires index or selector', () => {
    expect(() => inspectElement({})).toThrow(/requires either/);
  });
});
