import type { ChatMessage } from './providers/types';

const STORAGE_MAX_DIM = 768;
const STORAGE_QUALITY = 0.7;

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

async function shrinkBase64Image(
  data: string,
  mediaType: string,
): Promise<{ data: string; mediaType: string }> {
  const blob = await (await fetch(`data:${mediaType};base64,${data}`)).blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, STORAGE_MAX_DIM / Math.max(bitmap.width, bitmap.height));
    if (scale === 1) return { data, mediaType };
    const canvas = new OffscreenCanvas(
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
    );
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const out = await canvas.convertToBlob({ type: 'image/jpeg', quality: STORAGE_QUALITY });
    return { data: await blobToBase64(out), mediaType: 'image/jpeg' };
  } finally {
    bitmap.close();
  }
}

/**
 * Returns a copy of the message with image parts downscaled for persistence.
 * The live agent turn keeps full resolution; history replays (and follow-up
 * API calls) use the smaller version, keeping IndexedDB and token costs sane.
 */
export async function shrinkImagesForStorage(message: ChatMessage): Promise<ChatMessage> {
  const parts = await Promise.all(
    message.parts.map(async (part) => {
      if (part.type === 'image') {
        return { ...part, ...(await shrinkBase64Image(part.data, part.mediaType)) };
      }
      if (part.type === 'tool_result') {
        const content = await Promise.all(
          part.content.map(async (c) =>
            c.type === 'image' ? { ...c, ...(await shrinkBase64Image(c.data, c.mediaType)) } : c,
          ),
        );
        return { ...part, content };
      }
      return part;
    }),
  );
  return { ...message, parts };
}
