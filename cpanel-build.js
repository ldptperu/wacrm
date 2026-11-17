/**
 * cPanel build helper for accounts without SSH/Terminal.
 *
 * Usage:
 *   1. Setup Node.js App → Run JS script → select `cpanel-build.js`.
 *   2. Wait for "BUILD_OK".
 *   3. Click Restart.
 *
 * cPanel's ZIP deployment ships a `.npmrc` with `omit=dev`, so only
 * production and build dependencies are installed. The tooling
 * (eslint, vitest, supabase CLI, prettier) stays out to keep the
 * install under the account's memory limit.
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

function childEnv(memoryMb) {
  return {
    ...process.env,
    NODE_ENV: "production",
    npm_config_omit: "dev",
    npm_config_audit: "false",
    npm_config_fund: "false",
    NODE_OPTIONS: process.env.NODE_OPTIONS || `--max-old-space-size=${memoryMb}`,
  };
}

function fail(result, label) {
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const error = new Error(`${label} terminó con código ${result.status}`);
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

function npm(args, label, memoryMb) {
  log(label);
  const env = childEnv(memoryMb);
  const npmCli = findNpmCli();

  if (npmCli) {
    fail(
      spawnSync(process.execPath, [npmCli, ...args], {
        cwd: appRoot,
        stdio: "inherit",
        env,
      }),
      label
    );
    return;
  }

  const npmBin = findNpmBin();
  if (npmBin) {
    fail(
      spawnSync(npmBin, args, { cwd: appRoot, stdio: "inherit", env }),
      label
    );
    return;
  }

  fail(
    spawnSync("npm", args, {
      cwd: appRoot,
      stdio: "inherit",
      shell: process.platform === "win32",
      env,
    }),
    label
  );
}

function hasModule(name) {
  return fs.existsSync(
    path.join(appRoot, "node_modules", ...name.split("/"), "package.json")
  );
}

try {
  log(`Node ${process.version}`);
  log(`Directorio de la aplicación: ${appRoot}`);

  const missing = [
    "next",
    "react",
    "react-dom",
    "typescript",
    "tailwindcss",
    "@tailwindcss/postcss",
    "shadcn",
    "@types/node",
    "@types/react",
    "@types/react-dom",
  ].filter((name) => !hasModule(name));

  if (missing.length > 0) {
    log(`Faltan dependencias (${missing.join(", ")}). Instalando producción + build...`);
    npm(
      ["install", "--omit=dev", "--no-audit", "--no-fund", "--maxsockets", "2"],
      "Ejecutando npm install --omit=dev...",
      768
    );
  } else {
    log("Dependencias de producción y build presentes; se omite npm install.");
  }

  npm(["run", "build"], "Compilando Next.js (npm run build)...", 2048);

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
