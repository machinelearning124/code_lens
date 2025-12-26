/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./App.tsx",
        "./index.tsx",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./services/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                // Neon / Cosmic Palette
                primary: {
                    DEFAULT: "#7c3aed", // Electric Violet
                    light: "#a78bfa",
                    dark: "#4c1d95",
                },
                accent: {
                    cyan: "#06b6d4", // Fluorescent Cyan
                    pink: "#db2777", // Hot Pink
                    void: "#050510", // Deep Void
                },
                // Backgrounds
                "aurora-dark": "#050510",
                "aurora-light": "#F8F9FF",
                "glass-dark": "rgba(5, 5, 16, 0.6)",
                "glass-light": "rgba(255, 255, 255, 0.7)",

                // Semantic Text Colors (Typography Overhaul)
                text: {
                    heading: { DEFAULT: "#0f172a", dark: "#FFFFFF" }, // Deep Slate / Pure White
                    body: { DEFAULT: "#334155", dark: "#e2e8f0" },    // Slate-700 / Slate-200 (Soft White)
                    muted: { DEFAULT: "#475569", dark: "#e2e8f0" },   // Solid Slate / Bright Silver (Ultimate Contrast)
                },
            },
            fontFamily: {
                sans: ["Inter", "sans-serif"],
            },
            animation: {
                'blob': 'blob 10s infinite',
                'spin-slow': 'spin 12s linear infinite',
            },
            keyframes: {
                blob: {
                    '0%': { transform: 'translate(0px, 0px) scale(1)' },
                    '33%': { transform: 'translate(30px, -50px) scale(1.1)' },
                    '66%': { transform: 'translate(-20px, 20px) scale(0.9)' },
                    '100%': { transform: 'translate(0px, 0px) scale(1)' },
                },
            },
        },
    },
    plugins: [],
}
