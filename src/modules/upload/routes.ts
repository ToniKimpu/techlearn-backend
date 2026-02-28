import { NextFunction, Request, Response, Router } from "express";

import { AppError } from "../../utils/errors.js";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { uploadSingle } from "../../middlewares/upload.js";
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
      const bucket = req.body.bucket as string | undefined;
      if (!bucket?.trim()) throw new AppError(400, "bucket is required");
      if (!req.file) throw new AppError(400, "file is required");

      const data = await uploadService.uploadFile(req.file, bucket.trim());
      return res.status(201).json({ message: "File uploaded", data });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
