import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';

// Explicit grammar subset instead of lowlight's ~35-language "common" set —
// saves ~200kB of bundle. Unlisted languages render unhighlighted but still
// get the language tag and copy button.
const HIGHLIGHT_LANGUAGES = {
  bash,
  css,
  javascript,
  json,
  markdown,
  python,
  sql,
  typescript,
  xml, // also covers html
  yaml,
};

// The one markdown renderer for chat: GFM (tables, strikethrough, task
// lists), syntax highlighting, and code blocks with a language tag + copy
// button. Both the history and the live stream render through this.

export function Markdown(props: { children: string }) {
  return (
    <div className="markdown max-w-full">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { languages: HIGHLIGHT_LANGUAGES }]]}
        components={{ pre: CodeBlock }}
      >
        {props.children}
      </ReactMarkdown>
    </div>
  );
}

/** Recursively flattens React children to the raw code text for copying. */
function textOf(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (node && typeof node === 'object' && 'props' in node) {
    return textOf((node.props as { children?: ReactNode }).children);
  }
  return '';
}

function CodeBlock(props: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);

  const code = props.children as { props?: { className?: string; children?: ReactNode } } | undefined;
  const language = /language-(\w+)/.exec(code?.props?.className ?? '')?.[1] ?? 'text';

  async function copy() {
    try {
      await navigator.clipboard.writeText(textOf(code?.props?.children).trimEnd());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable — nothing useful to do.
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-center justify-between border-b border-border bg-surface-raised px-2.5 py-1">
        <span className="font-mono text-label-sm text-faint">{language}</span>
        <button
          type="button"
          onClick={copy}
          className="font-mono text-label-sm text-faint transition-colors hover:text-text"
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <pre className="!my-0 !rounded-none !border-0">{props.children}</pre>
    </div>
  );
}
