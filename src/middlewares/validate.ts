import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

interface ValidateSchemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

export function validate(schemas: ValidateSchemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }
      if (schemas.query) {
        res.locals.query = schemas.query.parse(req.query);
      }
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const message = error.issues
          .map((e: z.ZodIssue) => (e.path.length ? `${e.path.join(".")}: ${e.message}` : e.message))
          .join(", ");

        return res.status(400).json({ message });
      }
      next(error);
    }
  };
}
