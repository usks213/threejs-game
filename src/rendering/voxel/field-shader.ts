import { FIELD_MAX_STEPS, FIELD_REFINEMENT_STEPS } from './field-raycast';

export const fieldVertexShader = /* glsl */`
out vec3 fieldWorldPoint;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  fieldWorldPoint = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

export const fieldFragmentShader = /* glsl */`
precision highp sampler3D;
in vec3 fieldWorldPoint;
out vec4 fieldColor;
#define gl_FragColor fieldColor
uniform sampler3D fieldDensity;
uniform vec3 fieldOrigin;
uniform float fieldStep;
uniform float fieldSize;
uniform float fieldCameraNear;
uniform mat4 projectionMatrix;
uniform vec3 fieldSunDirection;
uniform vec3 fieldSunColor;
uniform vec3 fieldAmbient;

float densityAt(vec3 p) {
  // Sample point 0 lies at the CENTER of texel 0, not its outside face.
  vec3 grid = clamp((p - fieldOrigin) / fieldStep, vec3(0.0), vec3(fieldSize - 1.0));
  return texture(fieldDensity, (grid + 0.5) / fieldSize).r;
}
bool brickInterval(vec3 origin, vec3 direction, out float entry, out float exit) {
  entry = 0.0; exit = 1e7;
  vec3 upper = fieldOrigin + vec3((fieldSize - 1.0) * fieldStep);
  for (int axis = 0; axis < 3; axis++) {
    if (abs(direction[axis]) < 1e-8) {
      if (origin[axis] < fieldOrigin[axis] || origin[axis] > upper[axis]) return false;
    } else {
      float a = (fieldOrigin[axis] - origin[axis]) / direction[axis];
      float b = (upper[axis] - origin[axis]) / direction[axis];
      entry = max(entry, min(a, b)); exit = min(exit, max(a, b));
      if (exit < entry) return false;
    }
  }
  return exit >= entry;
}
void main() {
  vec3 direction = normalize(fieldWorldPoint - cameraPosition);
  vec3 origin = cameraPosition;
  if (isOrthographic) {
    direction = normalize(-vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));
    origin = fieldWorldPoint - direction * dot(fieldWorldPoint - cameraPosition, direction);
  }
  float entry, exit;
  if (!brickInterval(origin, direction, entry, exit)) discard;
  // The camera may be inside a proxy. Begin at the actual near plane, not its
  // front face; no sign at a proxy boundary implies an artificial solid cap.
  float forward = -(viewMatrix * vec4(direction, 0.0)).z;
  entry = max(entry, fieldCameraNear / max(forward, 1e-6));
  if (exit < entry) discard;
  int count = min(${FIELD_MAX_STEPS}, max(1, int(ceil((exit - entry) / (fieldStep * 0.5)))));
  float previousT = entry, previous = densityAt(origin + direction * entry);
  float hit = abs(previous) < 1e-6 ? entry : -1.0;
  // A bounded interval march, not sphere tracing: the source field is not an
  // exact distance field. Sub-grid thin features can still be undersampled.
  for (int i = 1; i <= ${FIELD_MAX_STEPS}; i++) {
    if (i > count || hit >= 0.0) break;
    float t = mix(entry, exit, float(i) / float(count));
    float d = densityAt(origin + direction * t);
    if (abs(d) < 1e-6) { hit = t; break; }
    if ((previous < 0.0) != (d < 0.0)) {
      float low = previousT, high = t, lowDensity = previous, highDensity = d;
      for (int j = 0; j < ${FIELD_REFINEMENT_STEPS}; j++) {
        float mid = (low + high) * 0.5;
        float middle = densityAt(origin + direction * mid);
        if ((middle < 0.0) == (lowDensity < 0.0)) { low = mid; lowDensity = middle; }
        else { high = mid; highDensity = middle; }
      }
      hit = mix(low, high, abs(lowDensity) / max(1e-12, abs(lowDensity) + abs(highDensity)));
      break;
    }
    previousT = t; previous = d;
  }
  if (hit < 0.0) discard;
  vec3 p = origin + direction * hit;
  float h = fieldStep * 0.5;
  vec3 gradient = vec3(
    densityAt(p + vec3(h,0,0)) - densityAt(p - vec3(h,0,0)),
    densityAt(p + vec3(0,h,0)) - densityAt(p - vec3(0,h,0)),
    densityAt(p + vec3(0,0,h)) - densityAt(p - vec3(0,0,h)));
  // One-sided differences at brick faces need their actual sample spacing.
  vec3 upper = fieldOrigin + vec3((fieldSize - 1.0) * fieldStep);
  gradient /= max(vec3(1e-8), min(p + h, upper) - max(p - h, fieldOrigin));
  vec3 normal = dot(gradient, gradient) > 1e-12 ? normalize(gradient) : vec3(0,1,0);
  vec4 clip = projectionMatrix * viewMatrix * vec4(p, 1.0);
  float depth = clip.z / clip.w * 0.5 + 0.5;
  if (depth < 0.0 || depth > 1.0) discard;
  // Actors, water and other bricks must compare against the implicit surface,
  // never against the box proxy's exit face.
  gl_FragDepth = depth;
  float grass = smoothstep(0.45, 0.88, normal.y);
  float detail = 0.94 + 0.06 * sin(p.x * 2.3 + sin(p.z * 1.7)) * sin(p.z * 2.1 + p.y);
  vec3 albedo = mix(vec3(0.20,0.16,0.11), vec3(0.16,0.25,0.065), grass) * detail;
  float diffuse = max(dot(normal, fieldSunDirection), 0.0);
  vec3 illumination = fieldAmbient * (0.55 + 0.45 * max(normal.y, 0.0)) + fieldSunColor * diffuse / 3.14159265;
  gl_FragColor = vec4(albedo * illumination, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
