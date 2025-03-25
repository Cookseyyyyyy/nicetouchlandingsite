import React from "react";
import { Links, Meta, Outlet, Scripts } from "@remix-run/react";
import type { LinksFunction, MetaFunction } from "@remix-run/node";

export const meta: MetaFunction = () => {
  return [
    { title: "Nice Touch Landing Page" },
    { name: "description", content: "Welcome to Nice Touch" },
  ];
};

export const links: LinksFunction = () => {
  return [];
};

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
} 