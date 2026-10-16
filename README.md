# Abarrotes La Palma — sitio web

Página pública de Abarrotes, Carnicería y Papelería La Palma (30 aniversario).
Basada en la página principal (StoreFrontPage) de `replatform-new-repo`, convertida a HTML estático.

- `index.html` — la página. Todo lo editable vive entre `<!--SITIO-->` y `<!--/SITIO-->`.
- `editor.js` — editor visual. Se abre con `#editar` al final de la dirección (o el enlace "Editar página" del pie).
- `acceso.json` — token de GitHub cifrado con el usuario/contraseña del editor (AES-GCM + PBKDF2).
- Cada push a `main` publica en GitHub Pages (`.github/workflows/deploy.yml`).

Para revertir un cambio malo: GitHub → Commits → abrir el commit → "Revert", o `git revert <sha>`.
