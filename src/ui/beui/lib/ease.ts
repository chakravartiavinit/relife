import tokens from "@relife/tokens/tokens.json";

// ReLife: the JS twins of the CSS easing tokens (packages/tokens/tokens.json). Import these; never retype the arrays.
const curve = (name: keyof typeof tokens.ease) => tokens.ease[name].curve as unknown as readonly [number, number, number, number];

/** = --ease-out-quint: UI state changes (hover, press, toggles, menus). */
export const EASE_OUT = curve("out-quint");
/** = --ease-out-strong: entrances, reveals and celebrations. */
export const EASE_OUT_STRONG = curve("out-strong");
/** Accelerating curve for things that fall (a dropped ball, a toppled block). Not for UI entrances. */
export const EASE_IN = [0.55, 0, 1, 0.45] as const;
/** = --ease-in-out-strong: on-screen movement. */
export const EASE_IN_OUT = curve("in-out-strong");
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;

/** CSS string form of EASE_OUT for inline style transitions. */
export const EASE_OUT_CSS = `cubic-bezier(${EASE_OUT.join(", ")})`;

/** Press feedback on buttons and other tappable surfaces. */
export const SPRING_PRESS = {
  type: "spring",
  stiffness: 500,
  damping: 30,
  mass: 0.6,
} as const;

/** Content swaps — label/icon slots trading places inside a control. */
export const SPRING_SWAP = {
  type: "spring",
  stiffness: 460,
  damping: 30,
  mass: 0.55,
} as const;

/** Overlay panel entrances — modals and sheets summoned by pointer. */
export const SPRING_PANEL = {
  type: "spring",
  stiffness: 420,
  damping: 40,
  mass: 0.5,
} as const;

/** Shared-layout glides — pills, indicators and panels morphing between positions. */
export const SPRING_LAYOUT = {
  type: "spring",
  stiffness: 360,
  damping: 32,
  mass: 0.6,
} as const;

/** Cursor-follow physics for decorative mouse tracking (magnetic, tilt, dock). */
export const SPRING_MOUSE = {
  stiffness: 200,
  damping: 15,
  mass: 0.3,
} as const;

/** Dragged handles and fills (sliders) — critically damped `useSpring` config,
 * so the value follows the pointer butterily and never rebounds off an end. */
export const SPRING_GLIDE = {
  stiffness: 700,
  damping: 50,
  mass: 0.5,
} as const;
