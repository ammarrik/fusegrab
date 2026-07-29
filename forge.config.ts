import { VitePlugin } from '@electron-forge/plugin-vite'

const config = {
    packagerConfig: {
        // Product name — capital "R". Drives the macOS .app bundle name, the
        // Finder/Dock label (CFBundleDisplayName), the .dmg name, and the
        // Windows binary (Fusemass.exe). The npm package name stays lowercase
        // ("fusemass"); npm requires it. Note: don't set executableName to a
        // different case — @electron/packager derives CFBundleDisplayName from
        // it, so a lowercase executableName makes the macOS label lowercase.
        name: 'Fusemass',
        // macOS bundle identifier (CFBundleIdentifier). Without this it would
        // default to com.electron.fusemass. Helper bundles derive from it
        // (com.fusemass.app.helper, …).
        appBundleId: 'com.fusemass.app',
        // App bundle icon. Electron Forge appends the platform-appropriate
        // extension (.icns on macOS, .ico on Windows). Generate these from
        // assets/icon.png with `pnpm run generate-icons`.
        icon: './assets/icon',
        asar: {
            // ffmpeg/ffprobe binaries from ffmpeg-static / ffprobe-static must
            // be unpacked from asar so the OS can exec them at runtime.
            unpack: '**/node_modules/{ffmpeg-static/ffmpeg*,ffprobe-static/bin/**}',
        },
        // The rounded PNG is shipped so the runtime window/taskbar icon works
        // in packaged builds (see src/main.ts).
        extraResource: ['./assets/icon.rounded.png'],
        // Keep node_modules in the package (the Vite plugin would otherwise
        // strip everything outside /.vite). The main process loads a few CJS
        // deps at runtime via createRequire (electron-squirrel-startup,
        // ffmpeg-static, ffprobe-static, ws); they must exist in node_modules.
        ignore: (file: string) => {
            if (!file) return false
            if (file.startsWith('/.vite')) return false
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
