import { VitePlugin } from '@electron-forge/plugin-vite'

// Dependencies the renderer uses but the packaged app must not carry a copy of.
// Vite bundles their code into /.vite (and the `fuse:onnx-runtime` plugin copies
// the one 23 MB wasm file Auto Captions actually loads), so shipping these
// source trees as well would add roughly 370 MB of dead weight — most of it
// onnxruntime-node, a native Node build we never load, and sharp's platform
// binaries. Both are hard dependencies of @huggingface/transformers.
const RENDERER_ONLY_MODULES = [
    '@huggingface',
    '@img',
    'mediabunny',
    'onnxruntime-node',
    'onnxruntime-web',
    'sharp',
]

const config = {
    packagerConfig: {
        // Product name — capital "F". Drives the macOS .app bundle name, the
        // Finder/Dock label (CFBundleDisplayName), the .dmg name, and the
        // Windows binary (Fuse.exe). The npm package name stays lowercase
        // ("fuse"); npm requires it. Note: don't set executableName to a
        // different case — @electron/packager derives CFBundleDisplayName from
        // it, so a lowercase executableName makes the macOS label lowercase.
        name: 'Fuse',
        // macOS bundle identifier (CFBundleIdentifier). Without this it would
        // default to com.electron.fuse. Helper bundles derive from it
        // (com.fuse.app.helper, …).
        appBundleId: 'com.fuse.app',
        // App bundle icon. Electron Forge appends the platform-appropriate
        // extension (.icns on macOS, .ico on Windows). Generate these from
        // assets/icon.png with `pnpm run generate-icons`.
        icon: './assets/icon',
        asar: true,
        // The rounded PNG is shipped so the runtime window/taskbar icon works
        // in packaged builds (see src/main.ts).
        extraResource: ['./assets/icon.rounded.png'],
        // Keep node_modules in the package (the Vite plugin would otherwise
        // strip everything outside /.vite). The main process loads a CJS dep
        // at runtime via createRequire (electron-squirrel-startup); it must
        // exist in node_modules.
        ignore: (file: string) => {
            if (!file) return false
            if (file.startsWith('/.vite')) return false
            if (
                RENDERER_ONLY_MODULES.some(
                    (name) =>
                        file === `/node_modules/${name}` ||
                        file.startsWith(`/node_modules/${name}/`),
                )
            )
                return true
            if (file === '/node_modules' || file.startsWith('/node_modules/'))
                return false
            if (file === '/package.json') return false
            return true
        },
    },
    rebuildConfig: {},
    makers: [
        {
            name: '@electron-forge/maker-squirrel',
            config: {
                // Installer + Add/Remove Programs icon on Windows.
                setupIcon: './assets/icon.ico',
            },
        },
        {
            name: '@electron-forge/maker-zip',
            platforms: ['darwin'],
        },
        {
            // macOS drag-to-install disk image. Uses the same .icns as the app
            // bundle for the volume icon. appdmg (pulled in transitively) needs
            // the fs-xattr / macos-alias native modules compiled — they're in
            // pnpm's onlyBuiltDependencies so a fresh install builds them.
            name: '@electron-forge/maker-dmg',
            platforms: ['darwin'],
            config: {
                icon: './assets/icon.icns',
                overwrite: true,
            },
        },
    ],
    plugins: [
        new VitePlugin({
            build: [
                {
                    entry: 'src/main.ts',
                    config: 'vite.main.config.ts',
                },
                {
                    entry: 'src/preload.ts',
                    config: 'vite.preload.config.ts',
                },
            ],
            renderer: [
                {
                    name: 'main_window',
                    config: 'vite.renderer.config.ts',
                },
            ],
        }),
    ],
}

export default config
