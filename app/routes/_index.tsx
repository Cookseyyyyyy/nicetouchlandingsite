import React, { useState, useEffect } from "react";
import type { MetaFunction } from "@remix-run/node";
import { Links } from "@remix-run/react";
import BallPit from "../components/ballpit";

export const meta: MetaFunction = () => {
  return [
    { title: "Nice Touch - Your Vision, Our Touch" },
    { name: "description", content: "See what a Nice Touch can do. Join our waiting list." },
  ];
};

// Import stylesheet from the app's CSS
export function links() {
  return [
    { rel: "stylesheet", href: "/App.css" }
  ];
}

export default function Index() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isClient, setIsClient] = useState(false);
  
  useEffect(() => {
    console.log("App component mounted");
    setIsClient(true);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Email submitted:", email);
    setSubmitted(true);
    setEmail("");
  };

  return (
    <div className="landing-container">
      {/* Render BallPit only on client-side */}
      {isClient && (
        <BallPit 
          gridWidth={10}
          gridHeight={10}
          gridDepth={2}
        />
      )}
      
      <header className="header">
        <div className="brand">Nice Touch</div>
        <nav>
          <a href="#about">About</a>
          <a href="#contact">Contact</a>
        </nav>
      </header>

      <main className="main-content">
        <div className="hero-content">
          <h1 className="main-title">YOUR TOOLS<br />YOUR VISION<br />NICE TOUCH</h1>
          <p className="infoline">See What A Nice Touch Can Do. Join The List.</p>

          <div className="signup-box">
            {!submitted ? (
              <form onSubmit={handleSubmit} className="signup-form">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter Your Email Address"
                  required
                />
                <button type="submit">SIGN UP</button>
              </form>
            ) : (
              <div className="success-message">
                <p>Thank you for signing up!</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
} 