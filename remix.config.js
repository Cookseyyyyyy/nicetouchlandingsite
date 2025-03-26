/** @type {import('@remix-run/dev').AppConfig} */
export default {
  ignoredRouteFiles: ["**/.*"],
  serverModuleFormat: "esm",
  // Specify the server target
  serverBuildTarget: "netlify",
  staticExport: true,
  // Tell Remix to use Vite
  future: {
    v2_routeConvention: true,
    v2_meta: true,
    v2_errorBoundary: true,
  },
}; 