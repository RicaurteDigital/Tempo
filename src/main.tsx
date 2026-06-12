// Tempo — Personal Time Operating System
// Entry point

// Design system CSS (order matters: tokens → global → animations)
import './design/tokens.css';
import './design/global.css';
import './design/animations.css';

import { render } from 'preact';
import { App } from './app';

render(<App />, document.getElementById('app')!);
