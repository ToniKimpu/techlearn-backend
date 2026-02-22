import { Router } from "express";
import { requireAuth } from "./authJwt";
import { prisma } from "../database/prisma";




const router = Router();
// ---------- GET MOVIES ----------

router.get("/movies", requireAuth, async (req, res) => {
  try {
    const movies = await prisma.movie.findMany();
    return res.json(movies);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ---------- CREATE MOVIE ----------
router.post("/create-movie", requireAuth, async (req, res) => {
  try {
    const { title } = req.body;
    if (!title) {
      return res.status(400).json({ message: "Title is required" });
    }
    const user = req.user as any;
    const movie = await prisma.movie.create({
      data: {
        title,
        updatedById: user.userId, // ✅ track who created/updated
      },
    });

    // 🔴 REALTIME EVENT
    const io = req.app.get("io");
    if (io) {
      io.emit("movie:created", {
        id: movie.id,
        title: movie.title,
      });
    }

    return res.status(201).json({
      message: "Movie created",
      movie,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
