# Despliegue en cPanel desde Git

cPanel (Meridian / AI App Hosting) ya puede desplegar una aplicación
Node.js directamente desde un repositorio Git: clona el código, instala
dependencias, ejecuta el build y mantiene el proceso vivo. No hace falta
subir un ZIP ni usar SSH.

> **Requisito de AI App Hosting:** usa contenedores Podman y el servidor
> debe permitir user namespaces (`user.max_user_namespaces > 0`). Si el
> deploy falla con `ea-podman requires user namespaces`, usa la
> **sección 6 (Setup Node.js App / Passenger)**, que no usa contenedores.

Este proyecto ya está preparado:

- `server.js` escucha el puerto que cPanel asigna (`process.env.PORT`).
- `package.json` tiene `build` (`next build`) y `start` (`node server.js`).
- `.env`, `node_modules` y `.next` están fuera de Git.

---

## 1. Subir el código a GitHub

Repositorio donde subirás el proyecto (créalo vacío, sin README):

```text
https://github.com/TU-USUARIO/wacrm.git
```

```bash
git add .
git commit -m "chore(deploy): prepare cPanel Git deployment"
git push origin main
```

Antes de hacer commit, confirma que no haya secretos:

```bash
git status --short          # .env no debe aparecer
git check-ignore .env       # debe imprimir .env
```

Las variables de entorno se configuran en cPanel, **nunca** en el
repositorio.

---

## 2. Crear la aplicación en cPanel

1. cPanel → **Websites & Apps** (Sitios web y aplicaciones) → **Add
   Website**.
2. Elige el dominio donde vivirá el CRM, o **Add another domain** para
   uno nuevo. Pulsa **Continue**.
3. Selecciona **AI App Hosting** → **Launch My Website**.
4. En **Select the source**, elige **Git repository**.
5. Introduce la URL de clonación:

   - Repositorio **público** (recomendado): URL HTTPS
     `https://github.com/TU-USUARIO/wacrm.git`.
   - Repositorio **privado**: URL SSH `git@github.com:TU-USUARIO/wacrm.git`
     y sigue el asistente para añadir una **deploy key** en GitHub.

6. Pulsa **Continue**.

### Configuración avanzada (Advanced)

Antes de pulsar **Deploy**, revisa:

| Ajuste | Valor |
|---|---|
| Node.js version | **20.x** o **22.x** (Next.js 16 exige >= 20.9) |
| Package manager | **npm** |
| Build command | `npm run build` |
| Startup command | `npm start` (ejecuta `server.js`) |
| Build output directory | `.next` |
| Run mode | **Production** |

cPanel suele detectar Next.js y rellenar estos valores solo. Si el
deploy falla con **«missing build output directory»**, el directorio
correcto es `.next`.

### Variables de entorno

Añádelas en **Advanced → Environment variables** (o luego en
**App Env**) **antes del primer deploy**:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ENCRYPTION_KEY=...        # 64 caracteres hex
META_APP_SECRET=...
NEXT_PUBLIC_SITE_URL=https://TU-DOMINIO
NEXT_PUBLIC_APP_LOCALE=en # idiomas incluidos: en, ko
```

Notas:

- **No configures `PORT`**: cPanel lo reserva y lo inyecta en la app.
- `NEXT_PUBLIC_*` se incrustan en el navegador **durante el build**.
  Si las cambias, hay que **Redeploy**, no basta con reiniciar.
- Si más adelante editas variables en **App Env**, pulsa **Redeploy**
  para aplicarlas.
- cPanel guarda estas variables en el `.env` de la aplicación; por eso
  el `.env` no debe estar trackeado en Git.

Pulsa **Deploy**. cPanel instala, compila y arranca la app.

---

## 3. Verificar

- Abre `https://TU-DOMINIO`. Debe redirigir a `/login`.
- En **App Logs** debe aparecer:

  ```text
  > wacrm ready on port XXXXX (production)
  ```

- En **Manage → Start / Restart / Redeploy** puedes controlar el proceso.

### Tras cada `git push`

cPanel no siempre redespliega solo. Entra en **Manage → Redeploy** para
traer el último commit, reconstruir y reiniciar. Un `force-push` que
reescriba el historial rompe el redeploy; evítalo.

---

## 4. Configuración posterior

- **Supabase Auth**: en Supabase → Authentication → URL Configuration,
  define `Site URL` y `Redirect URLs` con tu dominio de cPanel
  (`https://TU-DOMINIO/**`).
- **Migraciones** (solo la primera vez), desde tu equipo:

  ```bash
  npx supabase link --project-ref TU_PROJECT_REF
  npx supabase db push
  ```

- **WhatsApp Cloud API**: en Meta for Developers configura el webhook:

  ```text
  https://TU-DOMINIO/api/whatsapp/webhook
  ```

  El dominio necesita HTTPS válido y el `META_APP_SECRET` correcto.
- **Cron de automatizaciones/flujos** (si usas pasos de espera): llama a
  `/api/automations/cron` y `/api/flows/cron` con
  `AUTOMATION_CRON_SECRET`, desde el programador de cPanel o un servicio
  externo.

---

## 5. Solución de problemas

| Síntoma | Causa / solución |
|---|---|
| «Missing build output directory» | Configura `.next` como build output directory. |
| 502/503 o la app no arranca | Revisa **App Logs**; confirma `npm run build`, `.next` y el startup command `npm start`. |
| La app carga pero Supabase falla en el navegador | `NEXT_PUBLIC_*` no estaban definidas antes del build. Añádelas y pulsa **Redeploy**. |
| Error al instalar dependencias | Revisa el lockfile y la versión de Node; usa Node 20/22. |
| El build se queda sin memoria | Contacta al proveedor o limita el build; cPanel ejecuta la app en un contenedor con recursos limitados. |
| Sigue sirviendo código viejo | Falta **Redeploy** después del push. |
| `PORT` inválido | No definas `PORT` en App Env; cPanel lo gestiona. |
| `ea-podman requires user namespaces` / `user.max_user_namespaces is 0` | El servidor no permite contenedores. Usa la sección 6 (Passenger) o pide al proveedor que habilite `user.max_user_namespaces=15000`. |

---

## 6. Alternativa sin contenedores: Setup Node.js App (Passenger)

Úsala si AI App Hosting falla por los user namespaces de Podman o si tu
cPanel no tiene esa opción. Passenger sirve la app desde el propio
servidor, sin contenedores.

### 6.1 Clonar el repositorio

cPanel → **Git Version Control** → **Create** → **Clone a Repository**:

| Campo | Valor |
|---|---|
| Clone URL | `https://github.com/TU-USUARIO/wacrm.git` |
| Repository Path | `wacrm-app` |
| Branch | `main` |

Queda en `/home/TU_USUARIO/wacrm-app`.

### 6.2 Crear la aplicación

cPanel → **Setup Node.js App** → **Create Application**:

| Campo | Valor |
|---|---|
| Node.js version | 20.x o 22.x |
| Application mode | **Production** |
| Application root | `wacrm-app` |
| Application URL | tu dominio |
| Application startup file | `server.js` |

### 6.3 Variables de entorno (antes del build)

Las `NEXT_PUBLIC_*` se incrustan en el bundle durante el build. Crea
`.env.production` en la raíz del repo desde el Administrador de archivos:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://TU-PROYECTO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ENCRYPTION_KEY=...
META_APP_SECRET=...
NEXT_PUBLIC_SITE_URL=https://TU-DOMINIO
NEXT_PUBLIC_APP_LOCALE=en
```

```bash
chmod 600 .env.production
```

No se commitea: `.gitignore` excluye `.env*`.

### 6.4 Instalar y compilar

El ZIP incluye un `.npmrc` con `omit=dev`: cPanel instala solo las
dependencias de producción y las necesarias para compilar (TypeScript,
Tailwind y `@types`). El tooling de desarrollo (`eslint`, `vitest`,
`supabase` CLI, `prettier`) no se instala en cPanel para no agotar la
memoria del plan.

#### Con SSH/Terminal

```bash
source /home/TU_USUARIO/nodevenv/wacrm-app/22/bin/activate
cd ~/wacrm-app
npm ci --omit=dev
npm run build
```

#### Sin SSH/Terminal (Run JS script)

1. Comprueba que `cpanel-build.js` esté en la raíz de la app (viene en el ZIP).
2. Pulsa **Run JS script** y selecciona `cpanel-build.js`.
3. Espera 2–5 minutos. El script instala producción + build si faltan
   dependencias y ejecuta `next build`.
4. Busca `BUILD_OK` en la salida. Si la ventana corta el texto, descarga
   `cpanel-build.log` de la raíz de la app.
5. Pulsa **Restart** en Setup Node.js App.

**Run NPM Install** también funciona ahora (instala solo producción +
build), pero si vuelve a dar `Killed`, usa directamente **Run JS script**:
el script reintenta la instalación con menos concurrencia y menos heap de
Node.

Si **Run JS script** se corta por tiempo de espera, programa un cron
puntual (y bórralo después de ejecutarse):

```bash
/home/TU_USUARIO/nodevenv/wacrm-app/22/bin/node /home/TU_USUARIO/wacrm-app/cpanel-build.js >> /home/TU_USUARIO/wacrm-app/cpanel-build.log 2>&1
```

### 6.5 Reiniciar y verificar

cPanel → Setup Node.js App → **Restart**. En los logs debe aparecer:

```text
> wacrm ready on port XXXXX (production)
```

Tras cada `git push`: Git Version Control → **Update from Remote**,
repetir `npm ci --omit=dev && npm run build` y **Restart**.

Si el plan se queda sin memoria durante el build, compila en local y
sube `.next` junto con `node_modules`.
