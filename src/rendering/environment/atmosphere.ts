import * as THREE from 'three';
import type { AdventureSnapshot } from '../../game/types';
import { BIOMES } from '../../content/catalog';
export function createAtmosphere(scene: THREE.Scene) {
 const ambient = new THREE.HemisphereLight('#cbdfe5', '#495346', 1.4), sun = new THREE.DirectionalLight('#fff0d2', 2.6); sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-22;sun.shadow.camera.right=22;sun.shadow.camera.top=22;sun.shadow.camera.bottom=-22;sun.shadow.camera.near=1;sun.shadow.camera.far=100;sun.shadow.bias=-.0003;sun.shadow.normalBias=.035;scene.add(ambient, sun);
 const uniforms = { top: { value: new THREE.Color('#6699b9') }, horizon: { value: new THREE.Color('#ced9c5') }, sunDirection: { value: new THREE.Vector3() }, daylight: { value: 1 }, time: { value:0 } };
 const material = new THREE.ShaderMaterial({ uniforms, side: THREE.BackSide, depthWrite: false,
  vertexShader: 'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader: 'varying vec3 direction; uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDirection; uniform float daylight; uniform float time; void main(){vec3 d=normalize(direction);vec3 c=mix(horizon,top,pow(max(d.y,0.0),0.65));vec2 q=d.xz/max(.18,d.y)*1.4+vec2(time*.009,0.);float cloud=sin(q.x*.7+sin(q.y*.8))*sin(q.y*.6)+sin(q.x*1.9+q.y*.8)*.25;float wisps=smoothstep(.12,.7,cloud)*smoothstep(0.,.25,d.y);c=mix(c,vec3(.86,.89,.82)*(.2+.8*daylight),wisps*.62);float sun=pow(max(dot(d,normalize(sunDirection)),0.0),650.0);float star=step(0.9988,fract(sin(dot(floor(d*260.0),vec3(12.98,78.2,45.1)))*43758.54))*(1.0-daylight)*step(0.12,d.y);c+=vec3(1.0,0.8,0.48)*sun*daylight+vec3(star*0.6);gl_FragColor=vec4(c,1.0);}' });
 const sky = new THREE.Mesh(new THREE.SphereGeometry(72, 16, 10), material); sky.frustumCulled = false; sky.renderOrder = -2; scene.add(sky);
 const weatherPositions = new Float32Array(180 * 3), weatherGeometry = new THREE.BufferGeometry();
 weatherGeometry.setAttribute('position', new THREE.BufferAttribute(weatherPositions, 3).setUsage(THREE.DynamicDrawUsage));
 const weatherMaterial = new THREE.PointsMaterial({ color: '#d7e3e1', size: 0.08, transparent: true, opacity: 0.5, depthWrite: false });
 const weather = new THREE.Points(weatherGeometry, weatherMaterial); weather.frustumCulled = false; scene.add(weather);
 const day = new THREE.Color(), night = new THREE.Color('#17273c'), dusk = new THREE.Color('#ba8d91'), fogNight = new THREE.Color('#22344b');
 return {
  update(state: AdventureSnapshot, player: THREE.Vector3) {
   const env = state.environment, biome = BIOMES.find(b => b.id === state.biome)!;
   const cloudy = env.weather === 'rain' || env.weather === 'storm' || env.weather === 'fog';
   const light = Math.max(0.12, env.daylight), angle = (env.hour - 6) / 24 * Math.PI * 2;
   uniforms.top.value.copy(night).lerp(day.set(biome.sky), env.daylight);
   uniforms.horizon.value.copy(fogNight).lerp(env.daylight < 0.3 ? dusk : day.set(biome.fog), Math.max(0.2, env.daylight));
   uniforms.daylight.value = env.daylight; uniforms.time.value=env.seconds;
   uniforms.sunDirection.value.set(Math.cos(angle), Math.sin(angle), -0.3);
   sun.position.copy(player).addScaledVector(uniforms.sunDirection.value, 40); sun.target.position.copy(player); if (!sun.target.parent) scene.add(sun.target);
   sun.intensity = (0.15 + env.daylight * 2.8) * (cloudy ? 0.6 : 1); sun.color.set(env.daylight < 0.3 ? '#ffc792' : '#fff4d6');
   ambient.intensity = 0.45 + light * .8; ambient.color.copy(uniforms.top.value).lerp(day.set('#e9eee3'), 0.65);
   if (scene.fog instanceof THREE.Fog) { scene.fog.color.copy(uniforms.horizon.value); scene.fog.near = cloudy ? 16 : 30; scene.fog.far = cloudy ? 42 : 65; }
   sky.position.copy(player);
   weather.visible = ['rain', 'storm', 'snow', 'magic'].includes(env.weather);
   weatherMaterial.color.set(env.weather === 'magic' ? '#d6a9eb' : '#d7e3e1'); weatherMaterial.size = env.weather === 'snow' ? 0.12 : 0.05;
   if (weather.visible) { for (let i = 0; i < 180; i++) { const speed = env.weather === 'snow' ? 1.2 : 6; weatherPositions[i * 3] = player.x + Math.sin(i * 174.13) * 15; weatherPositions[i * 3 + 1] = player.y + 12 - ((env.seconds * speed + i * 0.413) % 14); weatherPositions[i * 3 + 2] = player.z + Math.cos(i * 74.92) * 15; } weatherGeometry.getAttribute('position').needsUpdate = true; }
  },
 };
}

