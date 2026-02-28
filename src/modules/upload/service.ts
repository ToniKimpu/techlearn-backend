import crypto from "crypto";

import { uploadToStorage } from "../../database/supabase.js";

const EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

async function uploadFile(file: Express.Multer.File, bucket: string): Promise<{ url: string }> {
  const ext = EXTENSION_MAP[file.mimetype] || "jpg";
  const filename = `${crypto.randomUUID()}.${ext}`;
  const url = await uploadToStorage(bucket, filename, file.buffer, file.mimetype);
  return { url };
}

export const uploadService = { uploadFile };
