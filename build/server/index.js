import { jsx, jsxs } from "react/jsx-runtime";
import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@remix-run/node";
import { RemixServer, Meta, Links, Outlet, Scripts } from "@remix-run/react";
import * as isbotModule from "isbot";
import { renderToPipeableStream } from "react-dom/server";
import { useRef, useState, useEffect } from "react";
import * as THREE from "three";
const ABORT_DELAY = 5e3;
function handleRequest(request, responseStatusCode, responseHeaders, remixContext, loadContext) {
  let prohibitOutOfOrderStreaming = isBotRequest(request.headers.get("user-agent")) || remixContext.isSpaMode;
  return prohibitOutOfOrderStreaming ? handleBotRequest(
    request,
    responseStatusCode,
    responseHeaders,
    remixContext
  ) : handleBrowserRequest(
    request,
    responseStatusCode,
    responseHeaders,
    remixContext
  );
}
function isBotRequest(userAgent) {
  if (!userAgent) {
    return false;
  }
  if ("isbot" in isbotModule && typeof isbotModule.isbot === "function") {
    return isbotModule.isbot(userAgent);
  }
  if ("default" in isbotModule && typeof isbotModule.default === "function") {
    return isbotModule.default(userAgent);
  }
  return false;
}
function handleBotRequest(request, responseStatusCode, responseHeaders, remixContext) {
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const { pipe, abort } = renderToPipeableStream(
      /* @__PURE__ */ jsx(
        RemixServer,
        {
          context: remixContext,
          url: request.url,
          abortDelay: ABORT_DELAY
        }
      ),
      {
        onAllReady() {
          shellRendered = true;
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          if (shellRendered) {
            console.error(error);
          }
        }
      }
    );
    setTimeout(abort, ABORT_DELAY);
  });
}
function handleBrowserRequest(request, responseStatusCode, responseHeaders, remixContext) {
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const { pipe, abort } = renderToPipeableStream(
      /* @__PURE__ */ jsx(
        RemixServer,
        {
          context: remixContext,
          url: request.url,
          abortDelay: ABORT_DELAY
        }
      ),
      {
        onShellReady() {
          shellRendered = true;
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          if (shellRendered) {
            console.error(error);
          }
        }
      }
    );
    setTimeout(abort, ABORT_DELAY);
  });
}
const entryServer = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: handleRequest
}, Symbol.toStringTag, { value: "Module" }));
const meta$1 = () => {
  return [
    { title: "Nice Touch Landing Page" },
    { name: "description", content: "Welcome to Nice Touch" }
  ];
};
const links$1 = () => {
  return [];
};
function App() {
  return /* @__PURE__ */ jsxs("html", { lang: "en", children: [
    /* @__PURE__ */ jsxs("head", { children: [
      /* @__PURE__ */ jsx("meta", { charSet: "utf-8" }),
      /* @__PURE__ */ jsx("meta", { name: "viewport", content: "width=device-width, initial-scale=1" }),
      /* @__PURE__ */ jsx(Meta, {}),
      /* @__PURE__ */ jsx(Links, {})
    ] }),
    /* @__PURE__ */ jsxs("body", { children: [
      /* @__PURE__ */ jsx(Outlet, {}),
      /* @__PURE__ */ jsx(Scripts, {})
    ] })
  ] });
}
const route0 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: App,
  links: links$1,
  meta: meta$1
}, Symbol.toStringTag, { value: "Module" }));
const BallPit = ({
  gridWidth = 10,
  gridHeight = 10,
  gridDepth = 2
}) => {
  const mountRef = useRef(null);
  useRef(null);
  useRef(null);
  useRef(null);
  useRef(null);
  useRef(null);
  useRef(null);
  useRef(null);
  useRef([]);
  useRef(null);
  useRef(null);
  useRef(new THREE.Raycaster());
  useRef(new THREE.Vector2());
  useRef(false);
  useRef(-1);
  useRef(1 / 60);
  useRef(0);
  const [bloomStrength, setBloomStrength] = useState(0.15);
  const [bloomRadius, setBloomRadius] = useState(0);
  const [bloomThreshold, setBloomThreshold] = useState(1);
  const [showControls, setShowControls] = useState(true);
  useEffect(() => {
    console.log("BallPit component mounting");
    return () => {
      console.log("BallPit component unmounting");
    };
  }, []);
  return /* @__PURE__ */ jsx(
    "div",
    {
      ref: mountRef,
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: -1
      }
    }
  );
};
const meta = () => {
  return [
    { title: "Nice Touch - Your Vision, Our Touch" },
    { name: "description", content: "See what a Nice Touch can do. Join our waiting list." }
  ];
};
function links() {
  return [
    { rel: "stylesheet", href: "/App.css" }
  ];
}
function Index() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    console.log("App component mounted");
    setIsClient(true);
  }, []);
  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Email submitted:", email);
    setSubmitted(true);
    setEmail("");
  };
  return /* @__PURE__ */ jsxs("div", { className: "landing-container", children: [
    isClient && /* @__PURE__ */ jsx(
      BallPit,
      {
        gridWidth: 10,
        gridHeight: 10,
        gridDepth: 2
      }
    ),
    /* @__PURE__ */ jsxs("header", { className: "header", children: [
      /* @__PURE__ */ jsx("div", { className: "brand", children: "Nice Touch" }),
      /* @__PURE__ */ jsxs("nav", { children: [
        /* @__PURE__ */ jsx("a", { href: "#about", children: "About" }),
        /* @__PURE__ */ jsx("a", { href: "#contact", children: "Contact" })
      ] })
    ] }),
    /* @__PURE__ */ jsx("main", { className: "main-content", children: /* @__PURE__ */ jsxs("div", { className: "hero-content", children: [
      /* @__PURE__ */ jsxs("h1", { className: "main-title", children: [
        "YOUR TOOLS",
        /* @__PURE__ */ jsx("br", {}),
        "YOUR VISION",
        /* @__PURE__ */ jsx("br", {}),
        "NICE TOUCH"
      ] }),
      /* @__PURE__ */ jsx("p", { className: "infoline", children: "See What A Nice Touch Can Do. Join The List." }),
      /* @__PURE__ */ jsx("div", { className: "signup-box", children: !submitted ? /* @__PURE__ */ jsxs("form", { onSubmit: handleSubmit, className: "signup-form", children: [
        /* @__PURE__ */ jsx(
          "input",
          {
            type: "email",
            value: email,
            onChange: (e) => setEmail(e.target.value),
            placeholder: "Enter Your Email Address",
            required: true
          }
        ),
        /* @__PURE__ */ jsx("button", { type: "submit", children: "SIGN UP" })
      ] }) : /* @__PURE__ */ jsx("div", { className: "success-message", children: /* @__PURE__ */ jsx("p", { children: "Thank you for signing up!" }) }) })
    ] }) })
  ] });
}
const route1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: Index,
  links,
  meta
}, Symbol.toStringTag, { value: "Module" }));
const serverManifest = { "entry": { "module": "/assets/entry.client-DX49VUEG.js", "imports": ["/assets/index-BJHAE5s4.js", "/assets/components-MtxdcAXG.js"], "css": [] }, "routes": { "root": { "id": "root", "parentId": void 0, "path": "", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/root-DPfxjo7U.js", "imports": ["/assets/index-BJHAE5s4.js", "/assets/components-MtxdcAXG.js"], "css": [] }, "routes/_index": { "id": "routes/_index", "parentId": "root", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasErrorBoundary": false, "module": "/assets/_index-CISu3cEB.js", "imports": ["/assets/index-BJHAE5s4.js"], "css": [] } }, "url": "/assets/manifest-69c8236b.js", "version": "69c8236b" };
const mode = "production";
const assetsBuildDirectory = "build\\client";
const basename = "/";
const future = { "v3_fetcherPersist": false, "v3_relativeSplatPath": false, "v3_throwAbortReason": false, "v3_routeConfig": false, "v3_singleFetch": false, "v3_lazyRouteDiscovery": false, "unstable_optimizeDeps": false };
const isSpaMode = false;
const publicPath = "/";
const entry = { module: entryServer };
const routes = {
  "root": {
    id: "root",
    parentId: void 0,
    path: "",
    index: void 0,
    caseSensitive: void 0,
    module: route0
  },
  "routes/_index": {
    id: "routes/_index",
    parentId: "root",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route1
  }
};
export {
  serverManifest as assets,
  assetsBuildDirectory,
  basename,
  entry,
  future,
  isSpaMode,
  mode,
  publicPath,
  routes
};
