import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const dir = new URL('../', import.meta.url);
const token = JSON.parse(readFileSync(new URL('design-tokens.json',dir),'utf8'));
const css = readFileSync(new URL('design-tokens.css',dir),'utf8');
const styles = readFileSync(new URL('styles.css',dir),'utf8');
const c = name => token.color[name].$value.hex;
function lum(hex){const rgb=hex.match(/[a-f0-9]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;}
function contrast(a,b){const x=lum(c(a)),y=lum(c(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
const normal=[['text','surface'],['text','bg'],['text-muted','surface'],['text-muted','bg'],['primary','surface'],['primary','primary-soft'],['primary','bg'],['secondary','surface'],['secondary','secondary-soft'],['primary','surface'],['primary-hover','surface'],['success','success-soft'],['warning','warning-soft'],['error','error-soft'],['info','info-soft'],['text-disabled','surface']];
test('all defined text pairs meet WCAG normal-text contrast 4.5:1',()=>{for(const [a,b] of normal)assert.ok(contrast(a,b)>=4.5,`${a}/${b}: ${contrast(a,b)}`);});
test('white text on primary and hover meets 4.5:1',()=>{for(const a of ['primary','primary-hover'])assert.ok(contrast(a,'surface')>=4.5);});
test('essential control border and focus meet 3:1 against white',()=>{for(const a of ['control-border','focus'])assert.ok(contrast(a,'surface')>=3,`${a}: ${contrast(a,'surface')}`);});
test('CSS color values match exported token values',()=>{for(const [name,v] of Object.entries(token.color))assert.ok(css.toLowerCase().includes(`--color-${name}:${v.$value.hex}`.toLowerCase()),name);});
test('touch, focus, reduced motion and hidden state rules exist',()=>{assert.match(css,/--target-size:48px/);assert.match(styles,/:focus-visible/);assert.match(styles,/prefers-reduced-motion/);assert.match(styles,/\[hidden\]\{display:none!important\}/);assert.match(styles,/forced-colors/);});
