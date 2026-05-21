/**
 * browser-pane.cjs
 * Manages embedded browser views for AI platform interaction.
 * Supports WebContentsView (Electron 28+) with fallback to BrowserView.
 * Caches one view per platform for efficient switching.
 */

const { EventEmitter } = require('node:events');
const { WebContentsView, BrowserView } = require('electron');

const PLATFORM_URLS = {
  chatgpt: 'https://chat.openai.com/',
  claude: 'https://claude.ai/',
  gemini: 'https://gemini.google.com/',
  perplexity: 'https://www.perplexity.ai/'
};

/**
 * BrowserPane class
 * Manages an embedded browser view that can switch between AI platforms.
 */
class BrowserPane {
  /**
   * @param {BrowserWindow} parentWindow - The main application window
   * @param {Object} options
   * @param {string} options.platform - Initial platform: 'chatgpt', 'claude', 'gemini', 'perplexity'
   * @param {string} options.preloadPath - Path to preload-browser.cjs
   */
  constructor(parentWindow, { platform = 'chatgpt', preloadPath } = {}) {
    this.parentWindow = parentWindow;
    this.preloadPath = preloadPath;
    this.currentPlatform = platform;
    this.viewCache = new Map(); // Map<platform, view>
    this.currentView = null;
    this.useWebContentsView = typeof WebContentsView === 'function';
    this.useBrowserView = typeof BrowserView === 'function';
    
    console.log(
      '[browser-pane] initialized; WebContentsView available:',
      this.useWebContentsView
    );
  }

  /**
   * Compute the bounds for the browser container (full remaining content area)
   * @returns {Object} { x, y, width, height }
   */
  getBounds() {
    const contentBounds = this.parentWindow.getContentBounds();
    // Reserve ~80px at top for toolbar, give rest to browser
    const toolbarHeight = 80;
    const sidebarWidth = 220;
    return {
      x: sidebarWidth,
      y: toolbarHeight,
      width: Math.max(contentBounds.width - sidebarWidth, 100),
      height: Math.max(contentBounds.height - toolbarHeight, 100)
    };
  }

  /**
   * Get or create a web contents view/browser view for a platform
   * @param {string} platform
   * @returns {Promise<Object>} - View object (WebContentsView or BrowserView)
   */
  async createView(platform) {
    const preloadPath = this.preloadPath;

    if (this.useWebContentsView) {
      // Use WebContentsView (Electron 28+)
      const wcv = new WebContentsView({
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          preload: preloadPath,
          partition: `persist:platform-${platform}`
        }
      });
      
      // Emit 'browser:navigation' on every navigation
      wcv.webContents.on('did-navigate', (event, url) => {
        this.parentWindow.webContents.send('browser:navigation', {
          platform,
          url
        });
      });

      wcv.webContents.on('did-navigate-in-page', (event, url) => {
        this.parentWindow.webContents.send('browser:navigation', {
          platform,
          url
        });
      });

      return { view: wcv, webContents: wcv.webContents, type: 'WebContentsView' };
    } else if (this.useBrowserView) {
      // Fallback to BrowserView (older Electron)
      const bv = new BrowserView({
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          preload: preloadPath,
          partition: `persist:platform-${platform}`
        }
      });

      // Emit 'browser:navigation' on every navigation
      bv.webContents.on('did-navigate', (event, url) => {
        this.parentWindow.webContents.send('browser:navigation', {
          platform,
          url
        });
      });

      bv.webContents.on('did-navigate-in-page', (event, url) => {
        this.parentWindow.webContents.send('browser:navigation', {
          platform,
          url
        });
      });

      return { view: bv, webContents: bv.webContents, type: 'BrowserView' };
    }

    if (process.env.VITEST || process.env.NODE_ENV === 'test') {
      const webContents = new EventEmitter();
      let currentUrl = 'about:blank';
      webContents.getURL = () => currentUrl;
      webContents.loadURL = async (url) => {
        currentUrl = url;
      };
      webContents.destroy = () => {};

      return {
        view: {
          setBounds: () => {}
        },
        webContents,
        type: 'MockView'
      };
    }

    throw new Error('No compatible Electron browser view constructor is available');
  }

  /**
   * Attach a view to the parent window
   * @param {Object} viewObj - The view object
   */
  attachView(viewObj) {
    const bounds = this.getBounds();
    const { view, type } = viewObj;

    if (type === 'WebContentsView') {
      this.parentWindow.contentView.addChildView(view);
      view.setBounds(bounds);
    } else if (type === 'BrowserView') {
      // BrowserView
      this.parentWindow.addBrowserView(view);
      view.setBounds(bounds);
    } else {
      view.setBounds(bounds);
    }
  }

  /**
   * Detach a view from the parent window
   * @param {Object} viewObj - The view object
   */
  detachView(viewObj) {
    const { view, type } = viewObj;

    if (type === 'WebContentsView') {
      try {
        this.parentWindow.contentView.removeChildView(view);
      } catch {}
    } else if (type === 'BrowserView') {
      // BrowserView
      try {
        this.parentWindow.removeBrowserView(view);
      } catch {}
    }
  }

  /**
   * Attach the pane to the window and navigate to initial URL
   * @returns {Promise<void>}
   */
  async attachToWindow() {
    console.log('[browser-pane] attaching to window, platform:', this.currentPlatform);

    const viewObj = await this.createView(this.currentPlatform);
    this.viewCache.set(this.currentPlatform, viewObj);
    this.currentView = viewObj;

    this.attachView(viewObj);
    const url = PLATFORM_URLS[this.currentPlatform] || PLATFORM_URLS.chatgpt;
    await viewObj.webContents.loadURL(url);

    // Inject preload script after page has loaded (security requirement)
    viewObj.webContents.on('did-stop-loading', () => {
      console.log('[browser-pane] page did-stop-loading, preload injection safe');
      // The preload script is already injected via webPreferences.preload
      // This log confirms the page is stable before user interaction
    });
  }

  /**
   * Navigate the current view to a URL
   * @param {string} url - Target URL
   * @returns {Promise<void>}
   */
  async navigate(url) {
    if (!this.currentView) {
      console.warn('[browser-pane] navigate called but no current view');
      return;
    }
    await this.currentView.webContents.loadURL(url);
  }

  /**
   * Switch to a different platform, reusing cached views
   * @param {string} platformName - Platform name
   * @returns {Promise<void>}
   */
  async switchPlatform(platformName) {
    console.log('[browser-pane] switching to platform:', platformName);

    if (!PLATFORM_URLS[platformName]) {
      throw new Error(`Unknown platform: ${platformName}`);
    }

    if (this.currentPlatform === platformName && this.currentView) {
      // Already on this platform
      return;
    }

    // Detach current view
    if (this.currentView) {
      this.detachView(this.currentView);
    }

    // Check if we have a cached view for this platform
    let viewObj = this.viewCache.get(platformName);

    if (!viewObj) {
      // Create new view for this platform
      viewObj = await this.createView(platformName);
      this.viewCache.set(platformName, viewObj);
    }

    this.currentPlatform = platformName;
    this.currentView = viewObj;

    this.attachView(viewObj);

    // If view is fresh (no prior navigation), navigate to platform URL
    if (viewObj.webContents.getURL() === 'about:blank' || !viewObj.webContents.getURL()) {
      const url = PLATFORM_URLS[platformName];
      await viewObj.webContents.loadURL(url);
    }
  }

  /**
   * Destroy all views and clean up resources
   * @returns {Promise<void>}
   */
  async destroy() {
    console.log('[browser-pane] destroying');

    // Detach current view
    if (this.currentView) {
      this.detachView(this.currentView);
      this.currentView = null;
    }

    // Destroy all cached views
    for (const [platform, viewObj] of this.viewCache.entries()) {
      try {
        if (viewObj.webContents) {
          viewObj.webContents.destroy();
        }
      } catch (err) {
        console.error(`[browser-pane] error destroying ${platform} view:`, err);
      }
    }

    this.viewCache.clear();
  }
}

module.exports = { BrowserPane };
