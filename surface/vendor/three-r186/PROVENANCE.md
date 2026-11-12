# three.js r186, vendored

- Version: three 0.186.0 (r186), MIT licence (see LICENSE in this folder).
- Source: the npm package, https://registry.npmjs.org/three/-/three-0.186.0.tgz, fetched 10 Nov 2026 with `npm pack`.
- Files: copied unchanged from the package's `build/` folder. The package ships no minified builds;
  these are the unminified ones. Minifying is a later step, when the download size is budgeted.
- Used only by `surface/`. The hub (`index.html`) does not load them.
- r186 is the version the house `webgpu-tsl` cheat sheet was checked against. r187 exists and was not used.

SHA-256:

```
9edde002b066a9a05676a6127f67735b62baf399bdea529f2f7e31657da769e6  three.core.js
9052042d676cb0fdc1ddfefe193053f34b7ac0513a616fdac4535d49987812ea  three.module.js
6e6b92d8ce467818944f73815a96abadc6392fb34de577d479a23810b6aeeed0  three.tsl.js
a78400fa1d359e81fcc12b84ed0a89a7fbecb4b8373e28ae8f9d2b11f6ea13bc  three.webgpu.js
```
