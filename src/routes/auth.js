import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { store } from "../store.js";
import { authenticateToken, JWT_SECRET } from "../middleware/auth.js";

const router = Router();

router.post("/register/", async (req, res) => {
  try {
    const { email, password, password2 } = req.body ?? {};

    if (!email || typeof email !== "string" || !email.includes("@")) {
      res.status(400).json({ email: ["Enter a valid email address."] });
      return;
    }

    if (!password || typeof password !== "string" || password.length < 8) {
      res.status(400).json({
        password: ["Ensure this field has at least 8 characters."],
      });
      return;
    }

    if (password !== password2) {
      res.status(400).json({ password: ["Passwords do not match."] });
      return;
    }

    if (await store.findUserByEmail(email)) {
      res.status(400).json({
        email: ["A user with this email already exists."],
      });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await store.createUser(email, passwordHash);

    res.status(201).json({ message: "User registered successfully." });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed." });
  }
});

router.post("/login/", async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      res.status(400).json({
        detail: "Email and password are required.",
      });
      return;
    }

    const user = await store.findUserByEmail(String(email));
    if (!user) {
      res.status(401).json({
        detail: "Invalid email or password.",
        error: "Invalid email or password.",
      });
      return;
    }

    const isMatch = await bcrypt.compare(String(password), user.passwordHash);
    if (!isMatch) {
      res.status(401).json({
        detail: "Invalid email or password.",
        error: "Invalid email or password.",
      });
      return;
    }

    const access = jwt.sign(
      { user_id: user.id, email: user.email, token_type: "access" },
      JWT_SECRET,
      { expiresIn: "30m" }
    );

    const refresh = jwt.sign(
      { user_id: user.id, email: user.email, token_type: "refresh" },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(200).json({ refresh, access });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed." });
  }
});

router.get("/profile/", authenticateToken, (req, res) => {
  res.status(200).json({
    id: req.user?.id,
    email: req.user?.email,
  });
});

export default router;
