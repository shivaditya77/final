// middleware/auth.js
const isAuth = (req, res, next) => {
    if (req.session.isAuth) {
        return next();
    }
    req.session.error = "Please login first to continue your journey ❤️";
    res.redirect("/login");
};

module.exports = isAuth;