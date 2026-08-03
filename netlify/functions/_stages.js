// Server-side re-export of the lifecycle/stage machine.
//
// src/lib/stages.js is the SINGLE source of truth for lifecycles, stages, SLAs
// and evidence gates. It is pure JavaScript with no React or DOM dependency, so
// the functions bundle can use it directly and the UI and the server can never
// disagree about what a stage means.
//
// This shim exists only so function code imports './_stages.js' like every other
// helper here instead of reaching across the tree with a relative path in a
// dozen files. esbuild (the configured Netlify bundler) inlines it at build.
export * from '../../src/lib/stages.js';
