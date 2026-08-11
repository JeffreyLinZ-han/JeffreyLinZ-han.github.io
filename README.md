# Jeffrey (Zihan) Lin — Robotics Portfolio v0.1

A static GitHub Pages portfolio with three project pages and three browser-based 3D experiences:

- Custom 6-DOF arm — MuJoCo WebAssembly interactive digital twin
- Berry harvesting robot — MuJoCo WebAssembly interactive model
- MRI-compatible needle robot — interactive STEP viewer using OpenCascade WASM

## Publish at JeffreyLinZ-han.github.io

1. On GitHub, create a **public** repository named exactly:
   `JeffreyLinZ-han.github.io`
2. Upload **the contents of this folder** to the repository root (index.html should be at the root, not inside another folder).
3. Commit/push to the `main` branch.
4. In GitHub: Settings → Pages → Build and deployment → Source: **Deploy from a branch** → `main` / `(root)` → Save.
5. The site will be available at:
   `https://JeffreyLinZ-han.github.io/`

## Local preview

Do not double-click `index.html` for the 3D demos. Browsers block model/WASM fetches from `file://`.
Run a small local web server from this folder instead:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## External runtime dependencies

The website source and all of Jeffrey's model/photo assets are included locally. The interactive viewers load pinned browser runtimes from public CDNs:

- Three.js 0.180.0
- Google DeepMind `@mujoco/mujoco` 3.11.0 (single-threaded WebAssembly)
- `occt-import-js` 0.0.23 for STEP triangulation

This keeps the repository deployable as plain GitHub Pages with no build step.

## Notes

- The harvesting model is large (hundreds of STL meshes); first load can take a while, especially on mobile.
- The MuJoCo pages show an explicit error message if the WASM runtime or assets fail to load.
- No LinkedIn link is included yet because none was provided.
- The site intentionally does not publish a phone number.
