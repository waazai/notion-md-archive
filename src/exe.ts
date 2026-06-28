// Entry point for the packaged single-file executable (bun --compile). A compiled
// binary can't rely on server.ts's `import.meta.url === argv[1]` self-start guard,
// so the exe entry starts the server unconditionally.
import { start } from "./server.js";

start();
