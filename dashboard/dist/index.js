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
  const register = window.__HERMES_PLUGINS__?.register;
  if (!SDK && !register) {
    // Neither SDK nor register available — silently exit
    // Hermes will show "插件脚本未调用 register()" but we can't do anything
    return;
  }

  const React = SDK.React;
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

  function statusDot(status) {
    if (status === "up")    return React.createElement("span", { className: "inline-block h-2 w-2 rounded-full bg-green-500" });
    if (status === "warning") return React.createElement("span", { className: "inline-block h-2 w-2 rounded-full bg-yellow-500" });
    if (status === "down")  return React.createElement("span", { className: "inline-block h-2 w-2 rounded-full bg-red-500" });
    return React.createElement("span", { className: "inline-block h-2 w-2 rounded-full bg-gray-400" });
  }

  function formatUptime(seconds) {
    if (!seconds) return "—";
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function formatRSS(mb) {
    if (!mb) return "—";
    return `${(mb / 1024).toFixed(1)} GB`;
  }

  function StatusRow({ service }) {
    return React.createElement("tr", { className: "border-t border-border hover:bg-muted/30 transition-colors" },
      React.createElement("td", { className: "py-2 px-3 font-medium text-sm" }, service.name),
      React.createElement("td", { className: "py-2 px-3" },
        React.createElement("div", { className: "flex items-center gap-1.5" },
          statusDot(service.status),
          React.createElement("span", { className: "text-xs uppercase tracking-wider" }, service.status || "unknown")
        )
      ),
      React.createElement("td", { className: "py-2 px-3 font-mono text-xs text-muted-foreground" }, service.pid || "—"),
      React.createElement("td", { className: "py-2 px-3 font-mono text-xs" }, formatRSS(service.rss_mb)),
      React.createElement("td", { className: "py-2 px-3 text-xs text-muted-foreground hidden md:table-cell" }, formatUptime(service.uptime_seconds)),
      React.createElement("td", { className: "py-2 px-3 font-mono text-xs text-muted-foreground hidden sm:table-cell" }, service.port || "—")
    );
  }

  function StackHealthPage() {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    const fetchData = useCallback(async () => {
      try {
        const json = await SDK.fetchJSON("/api/plugins/personal-stack-health/services");
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
                     : "text-green-500";
    const overallDot = down > 0 ? "bg-red-500" : warn > 0 ? "bg-yellow-500" : "bg-green-500";

    return React.createElement("div", { className: "flex flex-col gap-4 p-4" },
      // Header
      React.createElement("div", { className: "flex items-center justify-between" },
        React.createElement("div", { className: "flex items-center gap-2" },
          React.createElement("span", { className: `inline-block h-2.5 w-2.5 rounded-full ${overallDot}` }),
          React.createElement("span", { className: "font-bold text-sm uppercase tracking-wider" }, "Stack Health")
        ),
        React.createElement("div", { className: "flex items-center gap-3 text-xs text-muted-foreground" },
          React.createElement("span", null, `${up} up · ${warn} warn · ${down} down`),
          lastUpdated && React.createElement("span", null,
            `Updated ${lastUpdated.toLocaleTimeString()}`
          ),
          React.createElement("button", {
            onClick: fetchData,
            className: "ml-2 px-2 py-1 border border-border rounded text-xs hover:bg-muted transition-colors uppercase tracking-wider"
          }, "Refresh")
        )
      ),
      // Error
      error && React.createElement("div", { className: "p-3 border border-red-500/30 bg-red-500/10 rounded text-xs text-red-500 font-mono" },
        `Failed to load: ${error}`
      ),
      // Table
      data?.services && React.createElement("div", { className: "overflow-x-auto" },
        React.createElement("table", { className: "w-full text-sm" },
          React.createElement("thead", null,
            React.createElement("tr", { className: "border-b border-border text-xs uppercase tracking-wider text-muted-foreground" },
              React.createElement("th", { className: "py-2 px-3 text-left font-medium" }, "Service"),
              React.createElement("th", { className: "py-2 px-3 text-left font-medium" }, "Status"),
              React.createElement("th", { className: "py-2 px-3 text-left font-medium hidden md:table-cell" }, "PID"),
              React.createElement("th", { className: "py-2 px-3 text-left font-medium" }, "RSS"),
              React.createElement("th", { className: "py-2 px-3 text-left font-medium hidden md:table-cell" }, "Uptime"),
              React.createElement("th", { className: "py-2 px-3 text-left font-medium hidden sm:table-cell" }, "Port")
            )
          ),
          React.createElement("tbody", null,
            data.services.map(svc =>
              React.createElement(StatusRow, { key: svc.name, service: svc })
            )
          )
        )
      ),
      // Loading
      !data && !error && React.createElement("div", { className: "flex items-center justify-center py-12 text-muted-foreground text-xs uppercase tracking-wider" },
        "Loading..."
      )
    );
  }

  // Register the plugin component
  register("personal-stack-health", StackHealthPage);
})();