import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          0: "var(--bg-0)",
          1: "var(--bg-1)",
          2: "var(--bg-2)",
          3: "var(--bg-3)",
          panel: "var(--bg-panel)",
        },
        hair: {
          DEFAULT: "var(--hair)",
          2: "var(--hair-2)",
          3: "var(--hair-3)",
          pink: "var(--hair-pink)",
        },
        ink: {
          0: "var(--ink-0)",
          1: "var(--ink-1)",
          2: "var(--ink-2)",
          3: "var(--ink-3)",
          4: "var(--ink-4)",
        },
        brand: {
          DEFAULT: "var(--brand)",
          ink: "var(--brand-ink)",
          hover: "var(--brand-hover)",
          dim: "var(--brand-dim)",
          line: "var(--brand-line)",
          deep: "var(--brand-deep)",
        },
        violet: {
          DEFAULT: "var(--violet)",
          dim: "var(--violet-dim)",
        },
        amber: {
          DEFAULT: "var(--amber)",
          dim: "var(--amber-dim)",
        },
        orange: {
          DEFAULT: "var(--orange)",
          dim: "var(--orange-dim)",
        },
        red: {
          DEFAULT: "var(--red)",
          dim: "var(--red-dim)",
        },
        green: {
          DEFAULT: "var(--green)",
          dim: "var(--green-dim)",
        },
        blue: {
          DEFAULT: "var(--blue)",
          dim: "var(--blue-dim)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
        display: ["var(--font-display)"],
      },
      fontSize: {
        "10": ["10px", "1.4"],
        "10.5": ["10.5px", "1.4"],
        "11": ["11px", "1.4"],
        "11.5": ["11.5px", "1.4"],
        "12": ["12px", "1.5"],
        "12.5": ["12.5px", "1.5"],
        "13": ["13px", "1.5"],
        "13.5": ["13.5px", "1.5"],
        "14": ["14px", "1.5"],
        "16": ["16px", "1.3"],
        "20": ["20px", "1.2"],
        "28": ["28px", "1.1"],
        "36": ["36px", "1.1"],
        "48": ["48px", "1.1"],
      },
      letterSpacing: {
        tightest: "-0.01em",
        "wide-2": "0.02em",
        "wide-3": "0.03em",
        "wide-4": "0.04em",
        "wide-8": "0.08em",
        "wide-16": "0.16em",
      },
      borderRadius: {
        sm: "3px",
        DEFAULT: "4px",
        md: "4px",
        lg: "6px",
        xl: "8px",
      },
      boxShadow: {
        DEFAULT: "var(--shadow)",
        lg: "var(--shadow-lg)",
        header: "0 1px 2px rgba(0,0,0,0.03)",
      },
      spacing: {
        "4.5": "18px",
        "15": "60px",
        "55": "220px",
        "90": "360px",
      },
    },
  },
  plugins: [],
};

export default config;
