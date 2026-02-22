import { Prisma } from "../../generated/prisma/index.js";
import { Router } from "express";

import { prisma } from "../../database/prisma.js";
import { requireAuth } from "../../middlewares/requireAuth.js";

const router = Router();

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsedValue = Number.parseInt(value, 10);
  if (Number.isNaN(parsedValue) || parsedValue < 1) {
    return fallback;
  }

  return parsedValue;
}

function parseCurriculumId(value: string): bigint | null {
  try {
    const id = BigInt(value);
    if (id < 1n) {
      return null;
    }

    return id;
  } catch {
    return null;
  }
}

router.use(requireAuth);

router.post("/curriculums", async (req, res, next) => {
  try {
    const { name, description, image } = req.body as {
      name?: string;
      description?: string;
      image?: string;
    };

    const normalizedName = name?.trim();

    if (!normalizedName) {
      return res.status(400).json({ message: "Name is required" });
    }

    const curriculum = await prisma.curriculum.create({
      data: {
        name: normalizedName,
        description: description?.trim() || null,
        image: image?.trim() || "",
      },
    });

    return res.status(201).json({ message: "Curriculum created", data: curriculum });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return res.status(409).json({ message: "Curriculum name already exists" });
    }

    return next(error);
  }
});

router.get("/curriculums", async (req, res, next) => {
  try {
    const page = parsePositiveInt(req.query.page as string | undefined, DEFAULT_PAGE);
    const requestedLimit = parsePositiveInt(req.query.limit as string | undefined, DEFAULT_LIMIT);
    const limit = Math.min(requestedLimit, MAX_LIMIT);
    const search = (req.query.search as string | undefined)?.trim();

    const where: Prisma.CurriculumWhereInput = {
      isDeleted: false,
      ...(search
        ? {
            OR: [
              {
                name: {
                  contains: search,
                  mode: "insensitive",
                },
              },
              {
                description: {
                  contains: search,
                  mode: "insensitive",
                },
              },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.curriculum.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.curriculum.count({ where }),
    ]);

    return res.json({
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/curriculums/:id", async (req, res, next) => {
  try {
    const curriculumId = parseCurriculumId(req.params.id);

    if (!curriculumId) {
      return res.status(400).json({ message: "Invalid curriculum id" });
    }

    const curriculum = await prisma.curriculum.findFirst({
      where: {
        id: curriculumId,
        isDeleted: false,
      },
    });

    if (!curriculum) {
      return res.status(404).json({ message: "Curriculum not found" });
    }

    return res.json({ data: curriculum });
  } catch (error) {
    return next(error);
  }
});

router.put("/curriculums/:id", async (req, res, next) => {
  try {
    const curriculumId = parseCurriculumId(req.params.id);

    if (!curriculumId) {
      return res.status(400).json({ message: "Invalid curriculum id" });
    }

    const { name, description, image } = req.body as {
      name?: string;
      description?: string;
      image?: string;
    };

    const normalizedName = name?.trim();

    if (name !== undefined && !normalizedName) {
      return res.status(400).json({ message: "Name cannot be empty" });
    }

    const existingCurriculum = await prisma.curriculum.findFirst({
      where: {
        id: curriculumId,
        isDeleted: false,
      },
    });

    if (!existingCurriculum) {
      return res.status(404).json({ message: "Curriculum not found" });
    }

    const updatedCurriculum = await prisma.curriculum.update({
      where: { id: curriculumId },
      data: {
        ...(normalizedName !== undefined ? { name: normalizedName } : {}),
        ...(description !== undefined ? { description: description.trim() || null } : {}),
        ...(image !== undefined ? { image: image.trim() } : {}),
      },
    });

    return res.json({ message: "Curriculum updated", data: updatedCurriculum });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return res.status(409).json({ message: "Curriculum name already exists" });
    }

    return next(error);
  }
});

router.delete("/curriculums/:id", async (req, res, next) => {
  try {
    const curriculumId = parseCurriculumId(req.params.id);

    if (!curriculumId) {
      return res.status(400).json({ message: "Invalid curriculum id" });
    }

    const existingCurriculum = await prisma.curriculum.findFirst({
      where: {
        id: curriculumId,
        isDeleted: false,
      },
    });

    if (!existingCurriculum) {
      return res.status(404).json({ message: "Curriculum not found" });
    }

    await prisma.curriculum.update({
      where: { id: curriculumId },
      data: { isDeleted: true },
    });

    return res.json({ message: "Curriculum deleted" });
  } catch (error) {
    return next(error);
  }
});

export default router;
