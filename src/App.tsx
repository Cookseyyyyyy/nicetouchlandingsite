import { useState } from "react";
import "./App.css";

function App() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Here you would typically send the email to your backend or service
    console.log("Email submitted:", email);
    setSubmitted(true);
    setEmail("");
  };

  return (
    <div className="landing-container">
      <header className="header">
        <div className="brand">Nice Touch</div>
        <nav>
          <a href="#about">About</a>
          <a href="#contact">Contact</a>
        </nav>
      </header>

      <main className="centered-content">
        <div className="content-wrapper">
          <h1 className="main-title">Nice Touch</h1>
          <p className="tagline">Creative Tools For Creatives</p>
          <p className="infoline">Be the first to be in the know...</p>

          <div className="signup-box">
            {!submitted ? (
              <form onSubmit={handleSubmit} className="signup-form">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  required
                />
                <button type="submit">Sign Up</button>
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

export default App;
