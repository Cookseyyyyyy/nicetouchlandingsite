/** @type {import('@remix-run/dev').AppConfig} */
export default {
  ignoredRouteFiles: ["**/.*"],
  serverModuleFormat: "esm",
  // Specify the server target
  serverBuildTarget: "netlify",
  // Remove staticExport: true as it conflicts with server-side rendering
  future: {
    v2_routeConvention: true,
    v2_meta: true,
    v2_errorBoundary: true,
  },
}; 