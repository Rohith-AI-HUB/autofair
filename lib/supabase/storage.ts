'use client';

// 0-rupee image pipeline: resize in browser → WebP → upload to Supabase Storage.
// Keeps Supabase Free 1GB / 5GB egress alive: ~150-200KB per photo, 10 photos ≈ 2MB per car.

import { getBrowserClient } from '@/lib/supabase/client';
import { DbOperationError, SAFE_MESSAGES, classifyDbError } from '@/lib/errors/db-error';

export const PHOTO_BUCKET = 'vehicle-photos';
const MAX_DIM = 1280;
const WEBP_QUALITY = 0.8;

export async function compressToWebP(file: File): Promise<Blob> {
  // If already small webp, skip work
  if (file.type === 'image/webp' && file.size < 300 * 1024) return file;

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/webp', WEBP_QUALITY)
  );
  // Fallback to original if conversion fails or makes it bigger
  if (!blob || blob.size >= file.size) return file;
  return blob;
}

export function vehiclePhotoPath(vehicleId: string, index: number): string {
  const ts = Date.now();
  return `${vehicleId}/${ts}-${index}.webp`;
}

export async function uploadVehiclePhotos(
  vehicleId: string,
  files: File[]
): Promise<{ storagePath: string; publicUrl: string }[]> {
  const sb = getBrowserClient('local') ?? getBrowserClient('session');
  if (!sb) {
    throw new DbOperationError('storage.upload', new Error('Supabase not configured'), {
      status: 503,
      code: 'UNAVAILABLE',
      userMessage: SAFE_MESSAGES.UNAVAILABLE,
      context: { vehicleId, fileCount: files.length },
    });
  }

  const out: { storagePath: string; publicUrl: string }[] = [];
  for (let i = 0; i < files.length; i++) {
    const blob = await compressToWebP(files[i]);
    const path = vehiclePhotoPath(vehicleId, i);
    const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, blob, {
      contentType: 'image/webp',
      upsert: false,
    });
    if (error) {
      const classified = classifyDbError(error);
      throw new DbOperationError('storage.upload', error, {
        ...(classified.code === 'INTERNAL'
          ? { status: 500 as const, code: 'INTERNAL' as const, userMessage: SAFE_MESSAGES.UPLOAD_FAILED }
          : {}),
        // Never include the original file name in the user message — it can
        // leak local paths. Keep counts only; original error stays in logs.
        context: { vehicleId, fileCount: files.length, failedIndex: i },
      });
    }
    const { data } = sb.storage.from(PHOTO_BUCKET).getPublicUrl(path);
    out.push({ storagePath: path, publicUrl: data.publicUrl });
  }
  return out;
}
