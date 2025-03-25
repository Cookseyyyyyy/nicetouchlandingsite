import React from "react";
import type { MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
  return [
    { title: "Nice Touch - Home" },
    { name: "description", content: "Welcome to Nice Touch home page" },
  ];
};

export default function Index() {
  return (
    <div style={{ fontFamily: "system-ui, sans-serif", lineHeight: "1.8" }}>
      <h1>Welcome to Nice Touch</h1>
      <p>This is the homepage of our website.</p>
    </div>
  );
} 