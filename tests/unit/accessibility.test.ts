import {it,expect} from 'vitest';
import {normalizePreferences} from '../../src/ui/accessibility';
import {applyCameraLook} from '../../src/input/touch/look';
it('clamps persisted settings and rejects invalid keyboard codes',()=>{
 const s=normalizePreferences({textScale:5,volume:-4,distance:Infinity,bindings:{KeyW:'javascript:bad'},invertY:true});expect(s.textScale).toBe(1.4);expect(s.volume).toBe(0);expect(s.distance).toBe(5);expect(s.bindings.KeyW).toBe('KeyW');expect(s.invertY).toBe(true);
});
it('inverts vertical camera motion without changing horizontal movement or limits',()=>{
 const normal={yaw:0,pitch:0,distance:5,sensitivity:1},inverted={...normal,invertY:true};applyCameraLook(normal,20,10,.006);applyCameraLook(inverted,20,10,.006);expect(inverted.yaw).toBe(normal.yaw);expect(inverted.pitch).toBe(-normal.pitch);
});
it('does not restore conflicting persisted assignments',()=>{const s=normalizePreferences({bindings:{KeyW:'KeyA'}});expect(new Set(Object.values(s.bindings)).size).toBe(Object.keys(s.bindings).length);});

it('bounds view angle and preserves explicit combat modifier bindings',()=>{const s=normalizePreferences({fov:120,bindings:{KeyC:'ControlRight'}});expect(s.fov).toBe(85);expect(s.bindings.KeyC).toBe('ControlRight');expect(s.bindings.KeyH).toBe('KeyH');expect(s.bindings.Digit8).toBe('Digit8');expect(normalizePreferences(null).fov).toBe(55);});
