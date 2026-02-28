export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.authUser || !roles.includes(req.authUser.userType)) {
            return res.status(403).json({ message: "Forbidden" });
        }
        next();
    };
}
//# sourceMappingURL=requireRole.js.map