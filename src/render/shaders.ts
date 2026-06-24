/** Sources GLSL ES 300 du shader par défaut (éclairage directionnel simple). */

export const DEFAULT_VERTEX_SRC = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;

uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;

out vec3 vNormal;

void main() {
  // Approximation : valable pour rotation + échelle uniforme.
  vNormal = mat3(uModel) * aNormal;
  gl_Position = uProjection * uView * uModel * vec4(aPosition, 1.0);
}`;

export const DEFAULT_FRAGMENT_SRC = `#version 300 es
precision highp float;

in vec3 vNormal;
uniform vec3 uColor;
out vec4 fragColor;

void main() {
  vec3 n = normalize(vNormal);
  vec3 lightDir = normalize(vec3(0.5, 0.8, 0.6));
  float diff = max(dot(n, lightDir), 0.0);
  vec3 color = uColor * (0.25 + 0.75 * diff); // 0.25 = ambiant
  fragColor = vec4(color, 1.0);
}`;
