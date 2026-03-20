import { Router } from "express";
import type { z } from "zod";

import { requireAuth } from "../../middlewares/requireAuth.js";
import { requireRole } from "../../middlewares/requireRole.js";
import { validate } from "../../middlewares/validate.js";
import { listUsersQuery, updateUserStatusBody, userIdParam } from "./schemas.js";
import { usersService } from "./service.js";

const router = Router();

router.use(requireAuth);
router.use(requireRole("admin"));

router.get("/", validate({ query: listUsersQuery }), async (req, res, next) => {
  try {
    const query = res.locals.query as z.infer<typeof listUsersQuery>;
    const result = await usersService.listUsers(query);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
});

router.get("/:id", validate({ params: userIdParam }), async (req, res, next) => {
  try {
    const user = await usersService.getUserById(req.params.id as string);
    return res.json({ data: user });
  } catch (err) {
    return next(err);
  }
});

router.patch(
  "/:id/status",
  validate({ params: userIdParam, body: updateUserStatusBody }),
  async (req, res, next) => {
    try {
      const { isDeactivated } = req.body as z.infer<typeof updateUserStatusBody>;
      const result = await usersService.setUserStatus(req.params.id as string, isDeactivated);
      return res.json({
        message: `User ${isDeactivated ? "deactivated" : "activated"} successfully`,
        data: result,
      });
    } catch (err) {
      return next(err);
    }
  }
);

export default router;
