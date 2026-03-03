import crypto from "crypto";

import { deleteFromStorage, uploadToStorage } from "../../database/supabase.js";
import { BUCKET, UPLOAD_FOLDERS, type UploadFolder } from "../../config/storage.js";
import { AppError } from "../../utils/errors.js";

const EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

async function uploadFile(
  file: Express.Multer.File,
  folder: UploadFolder
): Promise<{ url: string }> {
  const ext = EXTENSION_MAP[file.mimetype] || "jpg";
  const path = `${UPLOAD_FOLDERS[folder]}/${crypto.randomUUID()}.${ext}`;
  const url = await uploadToStorage(BUCKET, path, file.buffer, file.mimetype);
  return { url };
}

async function deleteFile(fileUrl: string): Promise<void> {
  const SUPABASE_URL = process.env.SUPABASE_URL!;
  const prefix = `${SUPABASE_URL}/storage/v1/object/public/`;

  if (!fileUrl.startsWith(prefix)) {
    throw new AppError(400, "Invalid file URL");
  }

  const [bucket, ...rest] = fileUrl.replace(prefix, "").split("/");
  if (bucket !== BUCKET || rest.length === 0) throw new AppError(400, "Invalid file URL");

  await deleteFromStorage(BUCKET, rest.join("/"));
}

export const uploadService = { uploadFile, deleteFile };
