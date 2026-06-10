import { browser } from '#imports';
import { SCREENSHOT_MAX_DIM } from '../../constants';
import type { ToolExecResult } from '../registry';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function downscale(dataUrl: string, maxDim: number) {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && blob.type === 'image/jpeg') {
      return { data: await blobToBase64(blob), mediaType: 'image/jpeg' };
    }
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
    );
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
    return { data: await blobToBase64(out), mediaType: 'image/jpeg' };
  } finally {
    bitmap.close();
  }
}

export async function executeScreenshot(): Promise<ToolExecResult> {
  try {
    const dataUrl = await browser.tabs.captureVisibleTab({
      format: 'jpeg',
      quality: 80,
    });
    const { data, mediaType } = await downscale(dataUrl, SCREENSHOT_MAX_DIM);
    return { content: [{ type: 'image', mediaType, data }] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Screenshot failed: ${message}. The current tab may be a browser-internal page that cannot be captured.`,
        },
      ],
      isError: true,
    };
  }
}
