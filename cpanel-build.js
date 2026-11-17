/**
 * cPanel build helper for accounts without SSH/Terminal.
 *
 * Usage:
 *   1. Setup Node.js App → Run NPM Install (installs dependencies).
 *   2. Setup Node.js App → Run JS script → select `cpanel-build.js`.
 *   3. Wait for "BUILD_OK"; then click Restart.
 *
 * The script installs dev dependencies if they are missing (Next.js needs
 * TypeScript/Tailwind to build) and runs `npm run build`.
 */
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const appRoot = __dirname;
const logFile = path.join(appRoot, "cpanel-build.log");

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try {
    fs.appendFileSync(logFile, `${line}\n`);
  } catch {
    // Logging to file is best-effort.
  }
}

function runNode(args) {
  const env = {
    ...process.env,
    NODE_ENV: "production",
    NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=2048",
  };

  const result = spawnSync(process.execPath, args, {
    cwd: appRoot,
    stdio: "inherit",
    env,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const error = new Error(`El comando terminó con código ${result.status}`);
    error.status = result.status;
    throw error;
  }
}

function findNpmCli() {
  const binDir = path.dirname(process.execPath);
  const candidates = [
    path.join(binDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(binDir, "node_modules", "npm", "bin", "npm-cli.js"),
    path.join(binDir, "npm-cli.js"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function findNpmBin() {
  const candidate = path.join(path.dirname(process.execPath), "npm");
  return fs.existsSync(candidate) ? candidate : null;
}

function npm(args, label) {
  log(label);
  const npmCli = findNpmCli();
  if (npmCli) {
    runNode([npmCli, ...args]);
    return;
  }

  const npmBin = findNpmBin();
  if (npmBin) {
    const result = spawnSync(npmBin, args, {
      cwd: appRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_ENV: "production",
        NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=2048",
      },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      const error = new Error(`npm terminó con código ${result.status}`);
      error.status = result.status;
      throw error;
    }
    return;
  }

  // Fallback when npm is only available through PATH.
  const result = spawnSync("npm", args, {
    cwd: appRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      NODE_ENV: "production",
      NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=2048",
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const error = new Error(`npm terminó con código ${result.status}`);
    error.status = result.status;
    throw error;
  }
}

try {
  log(`Node ${process.version}`);
  log(`Directorio de la aplicación: ${appRoot}`);
  log(`NODE_ENV=${process.env.NODE_ENV || "(sin definir)"}`);

  const hasNext = fs.existsSync(path.join(appRoot, "node_modules", "next", "package.json"));
  const hasTypescript = fs.existsSync(
    path.join(appRoot, "node_modules", "typescript", "package.json")
  );

  if (!hasNext || !hasTypescript) {
    npm(
      ["install", "--include=dev", "--no-audit", "--no-fund"],
      "Faltan dependencias; ejecutando npm install --include=dev..."
    );
  } else {
    log("Dependencias presentes; se omite npm install.");
  }

  npm(["run", "build"], "Compilando Next.js (npm run build)...");

  // Ask Passenger to reload on the next request when supported.
  try {
    fs.mkdirSync(path.join(appRoot, "tmp"), { recursive: true });
    fs.writeFileSync(
      path.join(appRoot, "tmp", "restart.txt"),
      new Date().toISOString()
    );
  } catch {
    // The cPanel Restart button is still available.
  }

  log("BUILD_OK: compilación completada. Pulsa Restart en cPanel.");
} catch (error) {
  log(`BUILD_FAILED: ${error.message}`);
  if (error.stack) log(error.stack);
  process.exit(error.status || 1);
}
