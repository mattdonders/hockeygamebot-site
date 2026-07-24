import * as universal from '../entries/pages/games/_page.ts.js';

export const index = 3;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/games/_page.svelte.js')).default;
export { universal };
export const universal_id = "src/routes/games/+page.ts";
export const imports = ["_app/immutable/nodes/3.DwXEvgRr.js","_app/immutable/chunks/DeSjnWta.js","_app/immutable/chunks/CTPYx3a8.js","_app/immutable/chunks/xihTtKlq.js"];
export const stylesheets = ["_app/immutable/assets/3.QoleHtTU.css"];
export const fonts = [];
