import { z } from "zod";
export function validate(schemas) {
    return (req, res, next) => {
        try {
            if (schemas.params) {
                req.params = schemas.params.parse(req.params);
            }
            if (schemas.query) {
                res.locals.query = schemas.query.parse(req.query);
            }
            if (schemas.body) {
                req.body = schemas.body.parse(req.body);
            }
            next();
        }
        catch (error) {
            if (error instanceof z.ZodError) {
                const message = error.issues
                    .map((e) => (e.path.length ? `${e.path.join(".")}: ${e.message}` : e.message))
                    .join(", ");
                return res.status(400).json({ message });
            }
            next(error);
        }
    };
}
//# sourceMappingURL=validate.js.map