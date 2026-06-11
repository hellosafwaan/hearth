import { describe, expect, it } from 'vitest';
import { sseData } from '../../../../src/lib/providers/sse';

function streamOf(...chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const out: string[] = [];
  for await (const data of sseData(stream)) out.push(data);
  return out;
}

describe('sseData', () => {
  it('yields each data line', async () => {
    expect(await collect(streamOf('data: one\n\ndata: two\n\n'))).toEqual(['one', 'two']);
  });

  it('skips [DONE], blank data, and non-data lines', async () => {
    expect(
      await collect(streamOf('event: ping\ndata: a\ndata:\ndata: [DONE]\n: comment\n')),
    ).toEqual(['a']);
  });

  it('reassembles frames split across network chunks', async () => {
    expect(
      await collect(streamOf('da', 'ta: {"x"', ':1}\nda', 'ta: {"y":2}\n')),
    ).toEqual(['{"x":1}', '{"y":2}']);
  });

  it('ignores a trailing line without a newline terminator', async () => {
    // SSE frames end with \n; an unterminated tail means a truncated stream.
    expect(await collect(streamOf('data: full\ndata: partial'))).toEqual(['full']);
  });
});
