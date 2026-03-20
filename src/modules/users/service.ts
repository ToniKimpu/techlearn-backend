import { prisma } from "../../database/prisma.js";
import { AppError } from "../../utils/errors.js";
import { removeAllCachedSessions } from "../../utils/session.js";
import { io } from "../../server.js";
import { invalidateCache } from "../../utils/cache.js";

type ListInput = {
  page: number;
  limit: number;
  search?: string;
  userType?: "admin" | "teacher" | "student";
  isDeactivated?: boolean;
};

async function listUsers({ page, limit, search, userType, isDeactivated }: ListInput) {
  const where = {
    isDeleted: false,
    ...(userType ? { userType } : {}),
    ...(isDeactivated !== undefined ? { isDeactivated } : {}),
    ...(search
      ? {
          OR: [
            { fullName: { contains: search, mode: "insensitive" as const } },
            { email: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.profile.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fullName: true,
        email: true,
        userType: true,
        isDeactivated: true,
        createdAt: true,
        authUser: { select: { id: true, emailVerifiedAt: true } },
      },
    }),
    prisma.profile.count({ where }),
  ]);

  return {
    data,
    pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
  };
}

async function getUserById(profileId: string) {
  const profile = await prisma.profile.findFirst({
    where: { id: profileId, isDeleted: false },
    select: {
      id: true,
      fullName: true,
      email: true,
      userType: true,
      isDeactivated: true,
      createdAt: true,
      authUser: { select: { id: true, emailVerifiedAt: true } },
    },
  });

  if (!profile) throw new AppError(404, "User not found");
  return profile;
}

async function setUserStatus(profileId: string, isDeactivated: boolean) {
  const profile = await prisma.profile.findFirst({
    where: { id: profileId, isDeleted: false },
    include: { authUser: { select: { id: true } } },
  });

  if (!profile) throw new AppError(404, "User not found");

  await prisma.profile.update({
    where: { id: profileId },
    data: { isDeactivated },
  });

  if (isDeactivated && profile.authUser) {
    const authId = profile.authUser.id;

    // Wipe all sessions from DB and Redis
    await prisma.session.deleteMany({ where: { authId } });
    await removeAllCachedSessions(authId);

    // Kick the user off any active socket connections
    io.in(`user:${profileId}`).disconnectSockets(true);
  }

  await invalidateCache(`profile:deactivated:${profileId}`);
  return { profileId, isDeactivated };
}

export const usersService = { listUsers, getUserById, setUserStatus };
