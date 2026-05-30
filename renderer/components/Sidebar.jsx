import React, { useEffect, useState } from "react";
import PropTypes from "prop-types";

// --- Garuda Tech icon (32x32 PNG embedded) ---
const GARUDA_ICON = `data:image/png;base64,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`;

// --- Theme definitions ---
const THEMES = {
  teal: {
    name: "Forest teal",
    swatch: "#1D9E75",
    sidebar: "#ffffff",
    border: "#e5e7eb",
    brand: "#111827",
    brandSub: "#9ca3af",
    tile: "#0F6E56",
    tileText: "#9FE1CB",
    sectionLabel: "#9ca3af",
    itemText: "#6b7280",
    itemHover: "#f0fdf4",
    itemHoverText: "#111827",
    activeBg: "#E1F5EE",
    activeBorder: "#1D9E75",
    activeText: "#085041",
    badge: "#E1F5EE",
    badgeText: "#085041",
    footerDot: "#1D9E75",
    footerText: "#9ca3af",
    iconStyle: "color",
  },
  midnight: {
    name: "Midnight dark",
    swatch: "#378ADD",
    sidebar: "#0f1117",
    border: "#1e2028",
    brand: "#f0f2f5",
    brandSub: "#4a4f5c",
    tile: "#185FA5",
    tileText: "#B5D4F4",
    sectionLabel: "#3a3d48",
    itemText: "#6b7280",
    itemHover: "#1a1d24",
    itemHoverText: "#e2e8f0",
    activeBg: "#0C447C",
    activeBorder: "#378ADD",
    activeText: "#B5D4F4",
    badge: "#0C447C",
    badgeText: "#B5D4F4",
    footerDot: "#378ADD",
    footerText: "#3a3d48",
    iconStyle: "color",
  },
  ember: {
    name: "Ember amber",
    swatch: "#EF9F27",
    sidebar: "#1a1410",
    border: "#2e2418",
    brand: "#faf0e0",
    brandSub: "#6b5a40",
    tile: "#854F0B",
    tileText: "#FAC775",
    sectionLabel: "#4a3820",
    itemText: "#7a6040",
    itemHover: "#241c14",
    itemHoverText: "#faf0e0",
    activeBg: "#633806",
    activeBorder: "#EF9F27",
    activeText: "#FAC775",
    badge: "#633806",
    badgeText: "#FAC775",
    footerDot: "#EF9F27",
    footerText: "#4a3820",
    iconStyle: "color",
  },
  slate: {
    name: "Slate minimal",
    swatch: "#5F5E5A",
    sidebar: "#ffffff",
    border: "#e5e7eb",
    brand: "#2C2C2A",
    brandSub: "#B4B2A9",
    tile: "#444441",
    tileText: "#D3D1C7",
    sectionLabel: "#B4B2A9",
    itemText: "#888780",
    itemHover: "#F1EFE8",
    itemHoverText: "#2C2C2A",
    activeBg: "#F1EFE8",
    activeBorder: "#5F5E5A",
    activeText: "#2C2C2A",
    badge: "#F1EFE8",
    badgeText: "#5F5E5A",
    footerDot: "#5F5E5A",
    footerText: "#B4B2A9",
    iconStyle: "mono",
  },
  coral: {
    name: "Coral warm",
    swatch: "#D85A30",
    sidebar: "#fdf8f6",
    border: "#f0ddd5",
    brand: "#2d1208",
    brandSub: "#c4a090",
    tile: "#993C1D",
    tileText: "#F5C4B3",
    sectionLabel: "#c4a090",
    itemText: "#a06040",
    itemHover: "#FAECE7",
    itemHoverText: "#2d1208",
    activeBg: "#FAECE7",
    activeBorder: "#D85A30",
    activeText: "#4A1B0C",
    badge: "#FAECE7",
    badgeText: "#993C1D",
    footerDot: "#D85A30",
    footerText: "#c4a090",
    iconStyle: "color",
  },
  garuda: {
    name: "Garuda gold",
    swatch: "#C8860A",
    sidebar: "#1C1409",
    border: "#3A2A0E",
    brand: "#F5DFA0",
    brandSub: "#7A5C20",
    tile: "#7A4A00",
    tileText: "#F5DFA0",
    sectionLabel: "#5A4010",
    itemText: "#9A7A40",
    itemHover: "#2A1E08",
    itemHoverText: "#F5DFA0",
    activeBg: "#3A2800",
    activeBorder: "#C8860A",
    activeText: "#F5DFA0",
    badge: "#3A2800",
    badgeText: "#C8860A",
    footerDot: "#C8860A",
    footerText: "#5A4010",
    iconStyle: "gold",
  },
};

// --- Icon style CSS filters ---
const ICON_FILTERS = {
  color: "none",
  mono: "grayscale(100%)",
  gold: "sepia(1) saturate(3) hue-rotate(5deg) brightness(1.1)",
};

// --- Nav structure ---
const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { id: "dashboard", label: "Dashboard", icon: "ti-layout-dashboard" },
      { id: "live", label: "Live Feed", icon: "ti-activity", badge: true },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { id: "llm", label: "Local LLM", icon: "ti-cpu" },
      { id: "prompts", label: "Prompt Templates", icon: "ti-file-text" },
      { id: "robot", label: "Robot Framework", icon: "ti-robot" },
    ],
  },
  {
    label: "Automation",
    items: [
      { id: "browser", label: "Browser Automation", icon: "ti-world" },
      { id: "git", label: "Git Monitor", icon: "ti-brand-git" },
    ],
  },
  {
    label: "System",
    items: [
      { id: "accounts", label: "Accounts", icon: "ti-users" },
      { id: "progress", label: "Progress Log", icon: "ti-list" },
      { id: "settings", label: "Settings", icon: "ti-settings" },
      { id: "logs", label: "Logs", icon: "ti-activity" },
    ],
  },
];

const THEME_KEY = "garuda_sidebar_theme";

// --- Main component ---
export default function Sidebar({ active, onSelect }) {
  const [version, setVersion] = useState("");
  const [themeId, setThemeId] = useState(
    () => localStorage.getItem(THEME_KEY) || "teal",
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  const t = THEMES[themeId] || THEMES.teal;
  const iconFilter = ICON_FILTERS[t.iconStyle] || "none";

  useEffect(() => {
    globalThis.rotator.app
      .version()
      .then((v) => setVersion(v))
      .catch(() => {});
  }, []);

  const pickTheme = (id) => {
    setThemeId(id);
    localStorage.setItem(THEME_KEY, id);
    setPickerOpen(false);
  };

  const s = {
    root: {
      width: "212px",
      minWidth: "212px",
      background: t.sidebar,
      borderRight: `1px solid ${t.border}`,
      display: "flex",
      flexDirection: "column",
      height: "100%",
      fontFamily: "inherit",
      transition: "background 0.3s, border-color 0.3s",
    },
    brandWrap: {
      padding: "14px 14px 12px",
      borderBottom: `1px solid ${t.border}`,
      flexShrink: 0,
    },
    brandRow: {
      display: "flex",
      alignItems: "center",
      gap: "9px",
      marginBottom: "2px",
    },
    tile: {
      width: "30px",
      height: "30px",
      borderRadius: "7px",
      background: t.tile,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      overflow: "hidden",
    },
    tileImg: {
      width: "26px",
      height: "26px",
      objectFit: "contain",
      filter: iconFilter,
      transition: "filter 0.3s",
    },
    brandName: {
      fontSize: "13px",
      fontWeight: 600,
      color: t.brand,
      lineHeight: 1.2,
    },
    brandSub: { fontSize: "10px", color: t.brandSub, paddingLeft: "39px" },
    nav: { flex: 1, padding: "8px 0", overflowY: "auto" },
    sectionLabel: {
      fontSize: "10px",
      fontWeight: 500,
      color: t.sectionLabel,
      padding: "10px 14px 3px",
      letterSpacing: "0.07em",
      textTransform: "uppercase",
    },
    footer: {
      padding: "10px 12px",
      borderTop: `1px solid ${t.border}`,
      display: "flex",
      alignItems: "center",
      gap: "7px",
      flexShrink: 0,
      position: "relative",
    },
    footerDot: {
      width: "6px",
      height: "6px",
      borderRadius: "50%",
      background: t.footerDot,
      flexShrink: 0,
      transition: "background 0.3s",
    },
    footerText: {
      fontSize: "11px",
      color: t.footerText,
      flex: 1,
      transition: "color 0.3s",
    },
    paletteBtn: {
      width: "20px",
      height: "20px",
      borderRadius: "50%",
      background: t.swatch,
      border: `2px solid ${t.border}`,
      cursor: "pointer",
      flexShrink: 0,
      outline: "none",
      boxShadow: "0 0 0 1px rgba(0,0,0,0.1)",
    },
    pickerPanel: {
      position: "absolute",
      bottom: "42px",
      left: "8px",
      background: t.sidebar,
      border: `1px solid ${t.border}`,
      borderRadius: "12px",
      padding: "8px",
      display: "flex",
      flexDirection: "column",
      gap: "2px",
      zIndex: 50,
      boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
      minWidth: "175px",
    },
    pickerHeading: {
      fontSize: "10px",
      fontWeight: 600,
      color: t.sectionLabel,
      letterSpacing: "0.07em",
      padding: "4px 8px 6px",
      textTransform: "uppercase",
    },
  };

  return (
    <div style={s.root}>
      <div style={s.brandWrap}>
        <div style={s.brandRow}>
          <div style={s.tile}>
            <img src={GARUDA_ICON} alt="Garuda Tech" style={s.tileImg} />
          </div>
          <span style={s.brandName}>Garuda Tech</span>
        </div>
        <div style={s.brandSub}>Strategic Learning Theatre</div>
      </div>

      <nav style={s.nav} aria-label="Main navigation">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <div style={s.sectionLabel}>{group.label}</div>
            {group.items.map((item) => (
              <NavItem
                key={item.id}
                item={item}
                isActive={active === item.id}
                t={t}
                iconFilter={iconFilter}
                onSelect={onSelect}
              />
            ))}
          </div>
        ))}
      </nav>

      <div style={s.footer}>
        <div style={s.footerDot} />
        <span style={s.footerText}>daemon - v{version}</span>
        <button
          style={s.paletteBtn}
          onClick={() => setPickerOpen((o) => !o)}
          title="Switch theme"
          aria-label="Switch sidebar theme"
        />
        {pickerOpen && (
          <div style={s.pickerPanel}>
            <div style={s.pickerHeading}>Theme</div>
            {Object.entries(THEMES).map(([id, th]) => (
              <PickerRow
                key={id}
                id={id}
                th={th}
                active={themeId === id}
                t={t}
                onPick={pickTheme}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

Sidebar.propTypes = {
  active: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
};

// --- NavItem ---
function NavItem({ item, isActive, t, iconFilter, onSelect }) {
  const [hovered, setHovered] = useState(false);
  const borderLeft = `2px solid ${isActive ? t.activeBorder : "transparent"}`;
  let background = "transparent";
  if (isActive) {
    background = t.activeBg;
  } else if (hovered) {
    background = t.itemHover;
  }

  let color = t.itemText;
  if (isActive) {
    color = t.activeText;
  } else if (hovered) {
    color = t.itemHoverText;
  }

  return (
    <button
      style={{
        display: "flex",
        alignItems: "center",
        gap: "9px",
        padding: "7px 14px",
        fontSize: "12.5px",
        cursor: "pointer",
        borderLeft,
        background,
        color,
        width: "100%",
        textAlign: "left",
        border: "none",
        transition: "background 0.12s, color 0.12s",
        outline: "none",
      }}
      onClick={() => onSelect(item.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-current={isActive ? "page" : undefined}
    >
      <i
        className={`ti ${item.icon}`}
        aria-hidden="true"
        style={{
          fontSize: "15px",
          flexShrink: 0,
          filter: isActive ? "none" : iconFilter,
          transition: "filter 0.2s",
        }}
      />
      <span>{item.label}</span>
      {item.badge && (
        <span
          style={{
            marginLeft: "auto",
            fontSize: "10px",
            fontWeight: 500,
            background: t.badge,
            color: t.badgeText,
            borderRadius: "10px",
            padding: "1px 6px",
          }}
        >
          3
        </span>
      )}
    </button>
  );
}

NavItem.propTypes = {
  item: PropTypes.shape({
    id: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    icon: PropTypes.string.isRequired,
    badge: PropTypes.bool,
  }).isRequired,
  isActive: PropTypes.bool.isRequired,
  t: PropTypes.shape({
    activeBg: PropTypes.string,
    activeBorder: PropTypes.string,
    activeText: PropTypes.string,
    itemHover: PropTypes.string,
    itemHoverText: PropTypes.string,
    itemText: PropTypes.string,
    badge: PropTypes.string,
    badgeText: PropTypes.string,
  }).isRequired,
  iconFilter: PropTypes.string.isRequired,
  onSelect: PropTypes.func.isRequired,
};

// --- PickerRow ---
function PickerRow({ id, th, active, t, onPick }) {
  const [hovered, setHovered] = useState(false);
  let background = "transparent";
  if (active) {
    background = t.activeBg;
  } else if (hovered) {
    background = t.itemHover;
  }

  const color = active ? t.activeText : t.itemText;
  const fontWeight = active ? 600 : 400;

  return (
    <button
      onClick={() => onPick(id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "9px",
        padding: "6px 8px",
        borderRadius: "7px",
        cursor: "pointer",
        background,
        border: "none",
        width: "100%",
        textAlign: "left",
        outline: "none",
      }}
    >
      <div
        style={{
          width: "14px",
          height: "14px",
          borderRadius: "50%",
          background: th.swatch,
          flexShrink: 0,
          boxShadow: "0 0 0 1px rgba(0,0,0,0.12)",
        }}
      />
      <span
        style={{
          fontSize: "12px",
          flex: 1,
          color,
          fontWeight,
        }}
      >
        {th.name}
      </span>
      {active && (
        <i
          className="ti ti-check"
          aria-hidden="true"
          style={{ fontSize: "12px", color: t.activeText }}
        />
      )}
    </button>
  );
}

PickerRow.propTypes = {
  id: PropTypes.string.isRequired,
  th: PropTypes.shape({
    name: PropTypes.string.isRequired,
    swatch: PropTypes.string.isRequired,
  }).isRequired,
  active: PropTypes.bool.isRequired,
  t: PropTypes.shape({
    activeBg: PropTypes.string,
    itemHover: PropTypes.string,
    itemText: PropTypes.string,
    itemHoverText: PropTypes.string,
    activeText: PropTypes.string,
  }).isRequired,
  onPick: PropTypes.func.isRequired,
};
