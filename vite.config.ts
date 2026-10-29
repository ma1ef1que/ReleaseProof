import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseUrl = env.VITE_SUPABASE_URL;
  let supabaseConnectSources: string[] = [];

  if (supabaseUrl) {
    try {
      const url = new URL(supabaseUrl);
      const isLocal =
        url.hostname === "localhost" || url.hostname === "127.0.0.1";
      if (
        (url.protocol === "https:" || (url.protocol === "http:" && isLocal)) &&
        url.pathname === "/" &&
        url.search === "" &&
        url.hash === ""
      ) {
        const websocketUrl = new URL(url);
        websocketUrl.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        supabaseConnectSources = [url.origin, websocketUrl.origin];
      }
    } catch {
      supabaseConnectSources = [];
    }
  }

  return {
    base: process.env.VITE_BASE_PATH ?? "/",
    plugins: [
      react(),
      tailwindcss(),
      {
        name: "supabase-csp",
        transformIndexHtml(html) {
          if (supabaseConnectSources.length === 0) {
            return html;
          }

          return html.replace(
            "connect-src 'self'",
            `connect-src 'self' ${supabaseConnectSources.join(" ")}`,
          );
        },
      },
    ],
  };
});
