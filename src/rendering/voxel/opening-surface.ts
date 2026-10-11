/** Surface appearance only: these masks never modify the saved density field.
 * Keep the authored causeway's top, apron and thickness aligned with
 * skyboundDensity. A dug floor below it must not inherit a floating stone road.
 * Both terrain renderers use the same palette and world-space pattern. */
export const openingSurfaceShader = /* glsl */`
vec3 openingSurface(vec3 base, vec3 p, vec3 n) {
  float meadow = step(-18.,p.x)*(1.-step(32.,p.x))*step(-48.,p.z)
    *step(-3.,p.y)*(1.-step(17.,p.y))*smoothstep(.65,.95,n.y);
  if(meadow>0.) {
    float patches = .5+.5*sin(p.x*.19+sin(p.z*.13))*sin(p.z*.23);
    base *= mix(vec3(1.),mix(vec3(.82,.91,.87),vec3(1.12,1.08,.94),patches),meadow);
  }
  float apron = step(8.,p.z);
  float top = mix(3.+(8.-p.z)*.58,3.-(p.z-8.)*.16,apron);
  float thickness = mix(1.2,.9,apron);
  float band = max(p.y-top,top-thickness-p.y);
  float road = (1.-smoothstep(2.,2.10,abs(p.x-10.)))
    *smoothstep(-18.10,-18.,p.z)*(1.-smoothstep(20.,20.10,p.z))
    *(1.-smoothstep(.04,.18,band));
  if(road<=0.)return base;
  float grain = .5+.5*sin(p.x*3.7+sin(p.z*2.3))*sin(p.z*4.1+p.x);
  float joint = smoothstep(.025,.065,abs(fract((p.z+18.)*.5)-.5));
  vec3 stone = vec3(.32,.29,.23)*mix(.82,1.08,grain)*mix(.72,1.,joint);
  return mix(base,stone,road);
}
`;
