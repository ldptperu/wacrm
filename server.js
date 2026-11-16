/**
 * cPanel / Phusion Passenger entry point.
 *
 * Passenger assigns the application a port through the `PORT`
 * environment variable and expects the process to start listening on
 * it. `next start` already reads `PORT`, but cPanel's Node.js app
 * manager needs a JavaScript startup file, so this thin wrapper boots
 * Next.js' production server in-process.
 *
 * cPanel → Setup Node.js App:
 *   Application root:  <project folder>
 *   Startup file:      server.js
 *   Application mode:  Production
 *
 * Local usage: npm run build && npm start
 */
const { createServer } = require("node:http");

// cPanel / Passenger provides PORT. Node's net server converts the
// numeric string ("3000") to a TCP port, while a socket path (some
// Passenger setups) is passed through untouched.
const port = process.env.PORT || 3000;
const dev = process.env.NODE_ENV === "development";

// Default to a production server when NODE_ENV is unset. Set it before
// requiring Next so the framework sees the final value at load time.
if (!dev) {
  process.env.NODE_ENV = "production";
}

const next = require("next");

const app = next({ dev, dir: __dirname });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = createServer((req, res) => {
      handle(req, res);
    });

    server.on("error", (error) => {
      console.error("wacrm server error:", error);
      process.exit(1);
    });

    server.listen(port, () => {
      console.log(`> wacrm ready on port ${port} (${dev ? "development" : "production"})`);
    });

    // Passenger stops apps with SIGTERM/SIGINT; close the listener so
    // restarts don't leave the port bound.
    for (const signal of ["SIGINT", "SIGTERM"]) {
      process.on(signal, () => {
        server.close(() => process.exit(0));
        setTimeout(() => process.exit(0), 5000).unref();
      });
    }
  })
  .catch((error) => {
    console.error("wacrm failed to start:", error);
    process.exit(1);
  });
