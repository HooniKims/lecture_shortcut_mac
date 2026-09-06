# CUE design exploration

## 0. Research Log
- User compared the three interactive mockups and selected C / Studio. This is the confirmed design for implementation.
- Official references viewed: Raycast press kit (https://www.raycast.com/press), Things features (https://culturedcode.com/things/features/), Stream Deck software (https://www.elgato.com/us/en/s/stream-deck-app). Images are archived in design/references.
- Embedded references: Raycast design system and minimalist execution guide. The explicit three-direction brief takes precedence over selecting one direction now.
- Image generation not used: these are interactive HTML mockups with real Korean text, not raster images of an interface.

## 1. Atmosphere & Identity
Working name CUE. A lecture screen switcher. The same six lecture targets appear in all variants for a fair comparison.
- A Focus / Raycast: graphite, compact command rows, tactile shortcut keycaps, a small coral accent, subtle inset lighting. Three-column settings and a dense dark presenter list.
- B Paper / Things: warm-white workspace, blue selection, generous typography and spacing. Two-column settings, inline selection details, bright presenter checklist.
- C Studio / Stream Deck: charcoal control surface, raised square pads, teal active outlines. Tile-based settings and two-column presenter pads.
C / Studio is selected. A / Focus and B / Paper are retained only as comparison references. These are references for composition and craft, not pixel-identical clones or final branding.

## 2. Color
Shared gallery: canvas #f4f3f0, foreground #242726, secondary #6d716e, border #dedfda, paper #ffffff.
A: surface #202125, sidebar #1b1c20, elevated #28292e, text #f3f3f5, secondary #a2a3ad, border #393a41, accent #ff806f, accent foreground #20100e, selected #34353d.
B: surface #ffffff, sidebar #f5f6f8, elevated #fafbfc, text #282d36, secondary #727883, border #e5e7eb, accent #2874dc, accent foreground #ffffff, selected #eaf2ff.
C: surface #191c21, sidebar #15181d, elevated #242930, text #f1f4f6, secondary #a0aab6, border #363d46, accent #73e2c2, accent foreground #11251f, selected #233e37.
Status: dark success #79ddb0, light success #237a54; warning #f3c676 / #956315; error #c84646. Traffic-light decor #ff6058, #ffbd2e, #28ca42. App identities: presentation #dc6848, browser #4c8be8, video #d64a57, code #3187c9, document #387bdd, note #555c68.

## 3. Typography
Use the system stack -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; this is an intentional desktop-native reference choice. Monospace: ui-monospace, SFMono-Regular, Menlo, monospace.
Scale: 11, 12, 13, 14, 16, 18, 22, 28, 36 px. Metadata at 11–12; functional labels at 13–14; titles 22–28; gallery heading 36. Korean word-break: keep-all; overflow-wrap: anywhere only for unbroken data strings.

## 4. Spacing & Layout
Base 4px; spacing scale 4/8/12/16/20/24/32/40/48/64. Window chrome 44px, primary rows 56px (A), 62px (B), pads 130px (C). Radius scale 4/6/8/12/16/20.
Gallery max-width 1440px. Desktop workbench places settings and presenter panel side by side at 1100px+. Below that, panel stacks below settings. Below 700px, sidebar becomes a horizontal preset strip, inspector stacks, tile grid uses two columns. Page scrolls naturally; no hidden primary content and no page overflow at 375px.

## 5. Components
- Gallery direction tabs: three real buttons, aria-pressed, keyboard reachable; show reference name, alphabet marker and active underline.
- Window frame: decorative macOS dots (not fake controls), product title and panel toggle. Border plus soft outer shadow and inset highlight.
- Preset navigation: selectable buttons with count; selected background and semantic aria-pressed.
- Target row/pad: icon, title, application, shortcut, live status; select for details. Presenter target button toggles the simulated active/minimized state.
- Keycap: shared modifier/action variants separated by visible, unboxed `+` signs. Modifiers use slate surfaces (Studio #354252 / #64758a / #edf2f8, Paper #e8edf4 / #a7b4c5 / #34465e for background/border/ink). Action keys use the theme accent (Studio #73e2c2 / #49b99a / #11251f, Paper #2874dc / #1754a5 / #ffffff), heavier text, and a stronger lower edge. All keys have an inset top highlight and short lower shadow so adjacent keys remain distinct even without color. Separators use secondary ink, 2px gaps, 10px in compact rows and 11px in fields. Canonical values and accessible inputs are unchanged. Used in rows, inspector, dialogs and presenter panel.
- Runtime shortcut field: one full-width, 44px-high native input retains the canonical shortcut for form submission and assistive technology. A pointer-transparent overlay displays the same beveled keycaps with 2px gaps, visible plus separators and 12px horizontal inset, plus a keyboard affordance. For five-key chords, hide the decorative keyboard affordance to keep the complete chord visible in narrow fields. The field remains one tab stop, with the existing accent border on focus. Main inspector, registration, and all three settings shortcuts share this primitive. Both keyboard capture and native recorded-shortcut events update the overlay immediately; an empty value shows “원하는 키 조합 누르기”. Modifier and navigation keys use familiar macOS glyphs (⌘ ⇧ ⌥ ⌃ ↩ ␣ ← → ↑ ↓), ordinary keys retain their labels. All surfaces use shared key/input/accent theme tokens and the modifier/action key variants; no motion is introduced.
- Inspector: selected target details, name, shortcut, browser tab move option and preview action.
- Presenter panel: draggable header, close button, mode indicator, target buttons, show/hide control in main toolbar. Dragging is only within this browser mockup.
- Settings dialog: monitor count simulation, display choice, standby toggle disabled on a single screen, restore setting.
- Add dialog: example app/window/tab selector and add action. Registration name defaults to the source window title (tab title for tabs, app name if no window title). Editable at registration and afterward; custom text survives changing the picker. Empty name uses the source title. Source title and alias are separate fields. Rename updates both the main list and presenter panel. Clearly demonstration data.
- Toast: aria-live feedback for prototype operations; no misleading native operation claims.
All controls have visible keyboard focus, hover, pressed, and disabled treatments. Empty search has a clear message.

## 6. Motion & Interaction
120ms opacity and transform feedback only. No ambient animation. Reduced motion disables transitions. Drag uses pointer capture and transform, constrained inside the viewport. Esc closes dialogs.
Mock interactions never control real apps. The shell labels the artifact as an interactive design mockup.

## 7. Depth & Surface
A/C: subtle white inset top rim, dark outer border, layered key/pad bevels. Floating window shadow 0 24px 60px rgba(25,30,35,.18), plus 0 3px 10px rgba(25,30,35,.08). B: clean paper surface with softer shadow. Gallery backgrounds are neutral atmospheric stages; accent remains in meaningful controls.

## 8. Accessibility Constraints & Accepted Debt
Visible focus ring, named inputs/buttons, aria-pressed for tabs and toggles, native dialog, no one-character CJK orphaning, reduced motion. At small sizes content reflows.
Accepted scope: explicitly requested throwaway design mockups; native switching, OS shortcuts, browser integration, real monitor discovery and installation are outside this artifact. C / Studio has been selected; native application implementation remains separate.

## 9. Runtime theme selection

The user requested B / Paper as a selectable light theme alongside C / Studio. Keep the current functional layout while adopting Paper's white surface (#ffffff), mist sidebar (#f5f6f8), graphite text (#282d36), muted text (#727883), blue accent (#2874dc) and pale-blue selection (#eaf2ff). All screen, inspector, dialog, input, keycap, toast, warning and presenter surfaces use shared semantic color tokens. Studio remains the default for existing configurations. Theme choice is stored with settings independently of registration restoration, synchronized across main/presenter windows, and applied to native window chrome. No animation or extra runtime dependency is needed for switching.

## 10. Runtime updates

Settings adds a compact update card above the theme controls, using existing elevated/input surfaces, border, accent, radius and 12/16px spacing tokens. It shows the current version, check status, and a manual check button. A saved toggle enables background checking on launch at most once per day; automatic checks show a one-time-per-version availability dialog; restart follows only an explicitly requested successful installation. Available updates add a small dot to the settings navigation and show release notes as escaped plain text. Installation requires an explicit confirmation mentioning the app restart and lecture interruption. Checking/downloading/installing controls disable duplicate work, progress uses native progress semantics, and completion restarts automatically when the user left the default restart option checked; otherwise it offers a separate restart button. Network, unpublished-feed and signature/install failures have readable Korean recovery text; no fake 'latest' result when the feed is unavailable. Status refreshes in place without replacing focused settings fields. Presenter panels show no update prompts. Both Studio and Paper reuse existing theme tokens. The update card and confirmation are keyboard reachable, with polite live status and visible focus.

## 11. Presenter list refinement

The presenter panel becomes a spacious shortcut list: 520×640 default, 380×400 minimum, resizable and still draggable by its header. Keep Studio/Paper tokens and shared differentiated keycaps with plus separators. A quiet branded header, clear monitor/mode summary, and screen count frame a vertically scrollable single-column list. Each row has a category icon, 15px user-editable screen name, secondary app name/status, and right-aligned shortcut. At narrow widths shortcut keys sit below the name. Header/footer remain stable while long lists scroll. Empty content explains how to register screens; no demo items ship. All rows use existing activation handlers and full-name tooltips. Do not add animations or dependencies.

## 12. Quick registration

A dedicated 520×620 native window uses the current Studio/Paper tokens, 24px padding, 22px heading, 14px labels, 12px metadata, 16px component spacing and existing raised keycaps. At 375px the single-column form reflows and scrolls. It captures before showing, then displays the source title, browser/app identity and full selectable URL (wrapped safely). Name and recommended shortcut are editable; tab movement defaults to detach but occurs only on later activation. Enter saves, Escape cancels, and both return focus without moving the source. Inline failures retain edits. Repeated capture while the window is open preserves the draft. No polling or new animation. Source metadata uses a bordered elevated card; loading/error states use the same shell. List registration defaults to a tab filter when tabs exist, with explicit tabs/windows/apps filters and counts. No silent change of target kind.

## 13. macOS menu bar

Use a dedicated transparent, monochrome Cue monogram for the macOS status item. The 18-point canvas has a 2-point rounded stroke and a short lower-right cue stroke; omit the app tile background. Keep an editable SVG and a 36-pixel PNG for Retina rendering. Mark the native image as a template so macOS supplies contrast and selected-state colors independently of the app theme. Reuse the existing menu, tooltip and actions.

The menu bar includes “업데이트 확인…” between the presenter panel and quit actions. It restores the main window and opens the existing update dialog directly. Repeated clicks preserve checking/download/install progress and never start an installation. Existing settings drafts remain behind the update dialog.

Update availability opens the existing themed dialog once per version per process, preserving any settings draft underneath. Show actual escaped release notes (bounded scrolling), explicit 업데이트/취소 actions, and a default-on native checkbox for restarting after successful installation. Reuse toggle-row and dialog tokens with a 16px gap. Errors never auto-restart. Menu requests are retained in native state until the main webview consumes them, including during startup.
