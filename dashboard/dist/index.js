/* eslint-disable */
/**
 * Hermes Stack Health — Dashboard Plugin
 *
 * One-glance health check for personal long-running services.
 * Calls the plugin's backend at /api/plugins/personal-stack-health/services.
 * Auto-refresh every 30s.
 *
 * Plain IIFE, no build step. Uses window.__HERMES_PLUGIN_SDK__ for React.
 */
(function () {
  "use strict";

  const SDK = window.__HERMES_PLUGIN_SDK__;
  if (!SDK) return;

  const { React } = SDK;
  const h = React.createElement;
  const { useState, useEffect, useCallback } = SDK.hooks;
  const { cn } = SDK.utils;

  // Services list — must match backend plugin_api.py
  const SERVICES = [
    { name: "ComfyUI_Ideogram", port: 8194 },
    { name: "n8n",             port: 5678 },
    { name: "OpenClaw gateway", port: 18789 },
    { name: "Prayer pipeline v3", port: 5000 },
    { name: "Hermes gateway",  port: 9119 },
  ];

  function fmtUptime(s) {
    if (s == null || s < 0) return "—";
    if (s < 60) return s + "s";
    if (s < 3600) return Math.floor(s / 60) + "m";
    if (s < 86400) return (s / 3600).toFixed(1) + "h";
    return (s / 86400).toFixed(1) + "d";
  }

  function StatusDot({ status }) {
    const cls = status === "up" ? "bg-emerald-500"
              : status === "warning" ? "bg-yellow-500"
              : status === "down" ? "bg-red-500"
              : "bg-gray-500";
    return h("span", { className: cn("inline-block h-2.5 w-2.5 rounded-full", cls) });
  }

  function StackHealthPage() {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    const fetchData = useCallback(async () => {
      try {
        const res = await fetch("/api/plugins/personal-stack-health/services", {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setData(json);
        setError(null);
        setLastUpdated(new Date());
      } catch (e) {
        setError(e.message);
      }
    }, []);

    useEffect(() => {
      fetchData();
      const id = setInterval(fetchData, 30000);
      return () => clearInterval(id);
    }, [fetchData]);

    // Header with overall status
    const up = data?.up || 0;
    const warn = data?.warning || 0;
    const down = data?.down || 0;
    const overallCls = down > 0 ? "text-red-500"
                     : warn > 0 ? "text-yellow-500"
                     : data ? "text-emerald-500" : "text-gray-500";
    const overallText = down > 0 ? `${down} down`
                      : warn > 0 ? `${warn} warning`
                      : data ? "all up" : "—";

    return h("div", { className: "flex flex-col gap-4 p-4 max-w-4xl" },
      // Header
      h("div", { className: "flex items-center justify-between border-b border-border pb-2" },
        h("h1", { className: "text-lg font-semibold flex items-center gap-2" },
          h("span", null, "Stack Health"),
          data && h("span", { className: cn("text-sm font-normal", overallCls) },
            `(${up + warn} up, ${down} down)`)
        ),
        h("div", { className: "flex items-center gap-2" },
          h("button", {
            onClick: fetchData,
            className: "px-3 py-1 text-xs rounded border border-border hover:bg-accent",
          }, "Refresh"),
          h("span", { className: "text-xs text-muted-foreground" },
            lastUpdated ? "Updated " + lastUpdated.toLocaleTimeString() : "—"
          )
        )
      ),

      // Error
      error && h("div", { className: "border border-red-500/40 bg-red-500/10 text-red-500 text-sm p-3 rounded" },
        "Failed to load: " + error
      ),

      // Loading
      !data && !error && h("div", { className: "text-muted-foreground text-sm p-4 text-center" },
        "Loading..."
      ),

      // Table
      data && h("table", { className: "w-full text-sm" },
        h("thead", null,
          h("tr", { className: "text-left text-xs text-muted-foreground border-b border-border" },
            h("th", { className: "px-3 py-2 font-medium" }, "Service"),
            h("th", { className: "px-3 py-2 font-medium" }, "Status"),
            h("th", { className: "px-3 py-2 font-medium" }, "PID"),
            h("th", { className: "px-3 py-2 font-medium" }, "RSS"),
            h("th", { className: "px-3 py-2 font-medium" }, "Uptime"),
            h("th", { className: "px-3 py-2 font-medium" }, "Port")
          )
        ),
        h("tbody", null,
          data.services.map((svc) =>
            h("tr", { key: svc.name, className: "border-b border-border/50 hover:bg-accent/30" },
              h("td", { className: "px-3 py-2 font-medium" }, svc.name),
              h("td", { className: "px-3 py-2" },
                h("div", { className: "flex items-center gap-2" },
                  h(StatusDot, { status: svc.status }),
                  h("span", null, svc.status)
                )
              ),
              h("td", { className: "px-3 py-2 font-mono text-xs text-muted-foreground" },
                svc.pid ?? "—"
              ),
              h("td", { className: "px-3 py-2 font-mono text-xs" },
                svc.rss_mb != null ? svc.rss_mb.toFixed(1) + " MB" : "—"
              ),
              h("td", { className: "px-3 py-2 text-xs text-muted-foreground" },
                fmtUptime(svc.uptime_s)
              ),
              h("td", { className: "px-3 py-2 font-mono text-xs text-muted-foreground" },
                svc.port ?? "—"
              )
            )
          )
        )
      )
    );
  }

  if (window.__HERMES_PLUGINS__ && typeof window.__HERMES_PLUGINS__.register === "function") {
    window.__HERMES_PLUGINS__.register("personal-stack-health", StackHealthPage);
  }
})();
