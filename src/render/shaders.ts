/** Sources GLSL ES 300 du shader par défaut (éclairage directionnel simple). */

export const DEFAULT_VERTEX_SRC = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aUv;

uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;

out vec3 vNormal;
out vec2 vUv;

void main() {
  // Approximation : valable pour rotation + échelle uniforme.
  vNormal = mat3(uModel) * aNormal;
  vUv = aUv;
  gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
}`;

export const DEFAULT_FRAGMENT_SRC = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec2 vUv;

uniform vec3 uColor;
uniform sampler2D uTexture;
uniform bool uHasTexture;

out vec4 fragColor;

void main() {
  vec3 n = normalize(vNormal);
  vec3 lightDir = normalize(vec3(0.5, 0.8, 0.6));
  float diff = max(dot(n, lightDir), 0.0);

  // Couleur de base = couleur du matériau, modulée par la texture si présente.
  vec3 base = uColor;
  if (uHasTexture) base *= texture(uTexture, vUv).rgb;

  vec3 color = base * (0.25 + 0.75 * diff); // 0.25 = ambiant
  fragColor = vec4(color, 1.0);
}`;
