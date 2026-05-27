import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";
import TrainingStatus from "./TrainingStatus";

const PLATFORMS = [
  { value: "chatgpt", label: "ChatGPT" },
  { value: "claude", label: "Claude" },
  { value: "gemini", label: "Gemini" },
  { value: "perplexity", label: "Perplexity" },
];

/**
 * BrowserPanel component
 * Provides an embedded browser interface for interacting with AI platforms.
 * Supports passive response capture via preload-browser.cjs.
 *
 * @param {Object} props
 * @param {string} props.initialPlatform - Starting platform (default: 'chatgpt')
 * @returns {React.ReactElement}
 */
export default function BrowserPanel({ initialPlatform = "chatgpt" }) {
  const [activePlatform, setActivePlatform] = useState(initialPlatform);
  const [lastCapturedAt, setLastCapturedAt] = useState(null);
  const [captureCount, setCaptureCount] = useState(0);
  const [totalDocs, setTotalDocs] = useState(0);
  const [browserUrl, setBrowserUrl] = useState("");
  const [loading, setLoading] = useState(false);

  /**
   * Handle platform tab click
   */
  const handlePlatformClick = async (platform) => {
    if (platform === activePlatform) return;

    setLoading(true);
    try {
      await window.rotator.browser.switchPlatform(platform);
      setActivePlatform(platform);
    } catch (err) {
      console.error("[BrowserPanel] switch platform failed:", err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Subscribe to capture events (via window.rotator.browser.onCapture)
   */
  useEffect(() => {
    const handleCapture = (payload) => {
      setCaptureCount((prev) => prev + 1);
      setLastCapturedAt(Date.now());
      if (payload.chunks > 0) {
        setTotalDocs((prev) => prev + (payload.chunks || 1));
      }
    };

    // Subscribe to capture events
    const unsubscribe = window.rotator.browser.onCapture(handleCapture);
    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  /**
   * Subscribe to browser navigation events
   */
  useEffect(() => {
    const handleNavigation = (payload) => {
      if (payload.url) {
        setBrowserUrl(payload.url);
      }
    };

    // Subscribe to navigation events via generic daemon event listener
    // This is forwarded from ipcRenderer.on('browser:navigation')
    const unsubscribe = window.rotator.browser.onNavigation(handleNavigation);
    return () => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    };
  }, []);

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-900">
      {/* Platform Tab Bar */}
      <div className="flex items-center gap-2 border-b border-gray-300 dark:border-gray-700 p-3 bg-gray-50 dark:bg-gray-800">
        {PLATFORMS.map((platform) => (
          <button
            key={platform.value}
            onClick={() => handlePlatformClick(platform.value)}
            disabled={loading}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activePlatform === platform.value
                ? "bg-blue-500 text-white"
                : "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 hover:bg-gray-300 dark:hover:bg-gray-600"
            } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {platform.label}
          </button>
        ))}
        {loading && (
          <div className="ml-auto text-sm text-gray-500 dark:text-gray-400">
            Switching...
          </div>
        )}
      </div>

      {/* Browser Container */}
      <div
        id="browser-pane-container"
        className="flex-1 bg-white dark:bg-gray-900 overflow-hidden"
        style={{
          // Height is set by CSS flex-1 and the container's computed layout
          minHeight: "300px",
        }}
      >
        {/* Browser views are attached here by electron-ui/browser-pane.cjs */}
      </div>

      {/* Training Status Footer */}
      <TrainingStatus
        captureCount={captureCount}
        lastCapturedAt={lastCapturedAt}
        totalDocs={totalDocs}
      />
    </div>
  );
}

BrowserPanel.propTypes = {
  initialPlatform: PropTypes.string,
};
