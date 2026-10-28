# ARDE Campo — app de campo (Android / iPhone)

Una sola app con PIN que reemplaza a los formularios técnico y comercial.
Cada persona entra con su PIN y ve solo sus módulos (Josef ve todo).

```
arde-campo/
├── servidor/   → Apps Script (la "API" que escribe en el Sheet)
│   ├── Api.gs  ├── Tecnico.gs  ├── Comercial.gs  └── appsscript.json
└── app/        → la app que se instala en el celular (se publica en GitHub Pages)
```

Los formularios actuales **siguen funcionando en paralelo**. No hace falta apagarlos el mismo día.

---

## Paso 1 — Crear la API (15 min, una sola vez)

1. Abre el Sheet **SISTEMA_AROMATIZACION_ACTUALIZADO** → *Extensiones → Apps Script*.
   (Que sea un proyecto **nuevo** ligado al Sheet: no lo mezcles con los proyectos de los formularios viejos.)
   Ponle de nombre **ARDE Campo API**.
2. Crea 3 archivos de script y pega el contenido de `Api.gs`, `Tecnico.gs` y `Comercial.gs`.
3. *Configuración del proyecto* → marca **"Mostrar el archivo de manifiesto appsscript.json"** → reemplaza su contenido por el de `appsscript.json`.
4. Selecciona la función **`configurarApp`** → **Ejecutar** → acepta los permisos.
   Esto:
   - crea la hoja **USUARIOS_APP** con un PIN distinto para cada persona (protegida: solo tú la editas),
   - crea la hoja **LOG_APP** (auditoría: quién, qué, cuándo, GPS con link a mapa),
   - continúa los correlativos desde el último ticket del Sheet (no reinicia en 0001),
   - programa el **resumen diario de las 7 p.m.** a operaciones@ardetodo.com.
5. **Implementar → Nueva implementación → Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
   - Copia la URL que termina en `/exec`.

## Paso 2 — Conectar la app con la API

En `app/js/config.js` reemplaza:

```js
API_URL: 'PEGAR_AQUI_LA_URL_DE_LA_API/exec',
```

por la URL del paso 1.

## Paso 3 — Publicar en GitHub Pages

1. En la cuenta de GitHub de ARDE crea el repositorio **`arde-campo`** (puede ser público: no contiene datos, solo la app; los datos viven en el Sheet y se protegen con PIN).
2. Sube **el contenido de la carpeta `app/`** a la raíz del repo (que `index.html` quede en la raíz).
3. *Settings → Pages → Branch: main / root → Save.*
4. En 1–2 min queda en `https://<cuenta-arde>.github.io/arde-campo/`.

## Paso 4 — Instalar en los celulares

- **Android (Chrome):** abrir el link → aparece "Instalar app" (o menú ⋮ → *Instalar aplicación*).
- **iPhone (Safari, obligatorio Safari):** abrir el link → botón Compartir → **"Agregar a pantalla de inicio"**.

Queda con el ícono de la llama ARDE y abre a pantalla completa, como una app.

## Paso 5 — Repartir los PINs

Están en la hoja **USUARIOS_APP** (columna PIN). Envía a cada uno **solo el suyo**, por privado.

| Quiero… | Hago… |
|---|---|
| Dar de baja a alguien | ACTIVO = NO → pierde acceso en máx. 5 min, aunque tenga la app abierta |
| Cambiar un PIN | Lo edito en la hoja (4 a 6 dígitos, que no se repita) |
| Agregar una persona | Nueva fila: NOMBRE (igual que en las listas), ROL = TECNICO / COMERCIAL / ADMIN, PIN, ACTIVO = SÍ |

Tras 6 PIN incorrectos, ese celular queda bloqueado 10 minutos.

---

## Qué hace la app (resumen para el equipo)

- **Funciona sin señal:** el registro se guarda en el celular y se envía solo cuando vuelve la señal. Nunca se duplica.
- **Borradores:** si se cierra a la mitad, al volver ofrece recuperar lo escrito (fotos incluidas).
- **Fecha real:** un registro hecho sin señal a las 10 a.m. queda con las 10 a.m. aunque llegue a las 3 p.m.
- **GPS + foto obligatoria en mantenimiento**, para la supervisión de HC.
- **Alertas antes de enviar:** visita duplicada el mismo día y lecturas mayores a la capacidad del tanque.
- **Validación con un clic:** el correo de cada instalación trae un botón "Validar"; al confirmarlo se marca VALIDADO_OPS = SÍ y el técnico ya la ve como programada.
- **Historial:** cada persona ve lo que envió en los últimos 7 días y su estado.

## Cuando hagas cambios

- **Cambio en el servidor (.gs):** *Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva → Implementar.* La URL **no cambia**.
- **Cambio en la app:** sube los archivos a GitHub y **sube la versión** en `app/sw.js` (`arde-campo-1.0.0` → `arde-campo-1.0.1`). Los celulares mostrarán "Hay una versión nueva → Actualizar".

## Si algo falla

| Síntoma | Causa probable |
|---|---|
| "No se pudo conectar" en todos | API_URL mal pegada, o la implementación no está en "Cualquier usuario" |
| Registros "rechazados" en el historial | Error de dato (p. ej. equipo ya retirado). El mensaje dice por qué; se corrige y se envía de nuevo |
| No llega el resumen de las 7 p.m. | Volver a ejecutar `configurarApp` (reinstala el disparador sin duplicar nada) |
| iPhone no ofrece instalar | Se abrió desde Chrome o WhatsApp: abrir el link en **Safari** |
