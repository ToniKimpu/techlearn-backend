import { NextFunction, Request, Response, Router } from "express";

import { AppError } from "../../utils/errors.js";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { uploadSingle } from "../../middlewares/upload.js";
import { UPLOAD_FOLDERS, type UploadFolder } from "../../config/storage.js";
import { uploadService } from "./service.js";

const router = Router();

router.post(
  "/upload",
  requireAuth,
  (req: Request, res: Response, next: NextFunction) => {
    uploadSingle(req, res, (err) => {
      if (err) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ message: "File size exceeds 5 MB limit" });
        }
        return res.status(400).json({ message: err.message });
      }
      next();
    });
  },
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const folder = req.body.folder as string | undefined;
      if (!folder?.trim()) throw new AppError(400, "folder is required");
      if (!(folder.trim() in UPLOAD_FOLDERS)) {
        throw new AppError(
          400,
          `Invalid folder. Allowed: ${Object.keys(UPLOAD_FOLDERS).join(", ")}`
        );
      }
      if (!req.file) throw new AppError(400, "file is required");

      const data = await uploadService.uploadFile(req.file, folder.trim() as UploadFolder);
      return res.status(201).json({ message: "File uploaded", data });
    } catch (error) {
      return next(error);
    }
  }
);

router.delete("/upload", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { url } = req.body as { url?: string };
    if (!url?.trim()) throw new AppError(400, "url is required");

    await uploadService.deleteFile(url.trim());
    return res.json({ message: "File deleted" });
  } catch (error) {
    return next(error);
  }
});

export default router;
