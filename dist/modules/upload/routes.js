import crypto from "crypto";
import { Router } from "express";
import { uploadToStorage } from "../../database/supabase.js";
import { requireAuth } from "../../middlewares/requireAuth.js";
import { uploadSingle } from "../../middlewares/upload.js";
const router = Router();
const EXTENSION_MAP = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
};
router.post("/upload", requireAuth, (req, res, next) => {
    uploadSingle(req, res, (err) => {
        if (err) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(400).json({ message: "File size exceeds 5 MB limit" });
            }
            return res.status(400).json({ message: err.message });
        }
        next();
    });
}, async (req, res, next) => {
    try {
        const bucket = req.body.bucket;
        if (!bucket?.trim()) {
            return res.status(400).json({ message: "bucket is required" });
        }
        if (!req.file) {
            return res.status(400).json({ message: "file is required" });
        }
        const ext = EXTENSION_MAP[req.file.mimetype] || "jpg";
        const filename = `${crypto.randomUUID()}.${ext}`;
        const url = await uploadToStorage(bucket.trim(), filename, req.file.buffer, req.file.mimetype);
        return res.status(201).json({ message: "File uploaded", data: { url } });
    }
    catch (error) {
        return next(error);
    }
});
export default router;
//# sourceMappingURL=routes.js.map