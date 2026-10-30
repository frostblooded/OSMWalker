// Where the Help text lives: its address carries a hash of it (set in
// vite.config.ts), so after a deploy that changes Help no cache hands back
// the old text. Apart from HelpSheet.tsx so main.tsx can warm it without
// pulling Help's code into startup JS.

/** Where the Help text lives; a new address whenever the text changes. */
export const HELP_URL = `${import.meta.env.BASE_URL}data/help.txt?v=${__HELP_VERSION__}`;
