// fonts are bundled locally (SIL Open Font License) — no external font service
import '@fontsource/barlow-condensed/latin-500.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource/barlow-condensed/latin-800-italic.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import '../ui/styles.css';
import { App } from './app';

const app = new App(document.getElementById('game')!, document.getElementById('ui')!);
// Development-only test bridge for automated browser checks (stripped from release builds).
if (import.meta.env.DEV) (window as unknown as { __bc: App }).__bc = app;
