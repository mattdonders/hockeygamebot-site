import * as universal from '../entries/pages/stats/skaters/_page.ts.js';

export const index = 4;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/stats/skaters/_page.svelte.js')).default;
export { universal };
export const universal_id = "src/routes/stats/skaters/+page.ts";
export const imports = ["_app/immutable/nodes/4.DE12KEO0.js","_app/immutable/chunks/DeSjnWta.js","_app/immutable/chunks/xihTtKlq.js"];
export const stylesheets = ["_app/immutable/assets/4.27J2K15i.css"];
export const fonts = [];
