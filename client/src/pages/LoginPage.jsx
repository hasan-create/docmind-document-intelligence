import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const registered = Boolean(location.state?.registered);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setErrorMessage("");
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const rawText = await response.text();
      let data = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = {};
      }

      if (!response.ok) {
        setErrorMessage(
          data.detail || data.error || "Invalid email or password."
        );
        return;
      }

      localStorage.setItem("access_token", data.access);
      localStorage.setItem("refresh_token", data.refresh);
      navigate("/dashboard");
    } catch {
      setErrorMessage("Unable to connect to the server.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1>DocMind AI</h1>
        <p className="subtitle">Chat with your documents using AI</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="primary-btn" disabled={submitting}>
            {submitting ? "Logging in..." : "Login"}
          </button>
        </form>

        {registered && !errorMessage && (
          <p className="success-message">
            Account created! Please sign in.
          </p>
        )}

        {errorMessage && <p className="error-message">{errorMessage}</p>}

        <p className="switch-auth">
          Don&apos;t have an account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
