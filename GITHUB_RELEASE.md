# Preparar una publicación en GitHub

El proyecto está listo para control de versiones, pero este paquete no crea un repositorio remoto ni publica una release.

Antes de cualquier publicación confirma explícitamente:

1. Nombre del repositorio.
2. Cuenta u organización de destino.
3. Visibilidad pública o privada.
4. Versión semántica de la release.

## Flujo recomendado

- `main`: versión estable.
- `develop`: integración.
- `feature/*`: trabajo enfocado; pull requests hacia `develop`.
- Pull request de release desde `develop` hacia `main` únicamente con CI exitoso.
- Commits convencionales y fechas reales.
- Tag semántico y ZIP limpio adjunto a la release.

No subas `.env`, tokens, cookies, claves, `data/`, logs, resultados de Playwright, `node_modules` ni información personal real. GitHub Pages no puede ejecutar esta aplicación porque requiere el servidor Node.js.
