/**
 * Programme GPU : compile un vertex + fragment shader (GLSL ES 300), les lie,
 * et met en cache les emplacements d'uniforms.
 */
export class Shader {
  readonly program: WebGLProgram;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();

  constructor(
    private readonly gl: WebGL2RenderingContext,
    vertexSrc: string,
    fragmentSrc: string,
  ) {
    const vs = this.compile(gl.VERTEX_SHADER, vertexSrc);
    const fs = this.compile(gl.FRAGMENT_SHADER, fragmentSrc);

    const program = gl.createProgram();
    if (!program) throw new Error("Impossible de créer le programme WebGL.");
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("Échec du link : " + gl.getProgramInfoLog(program));
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    this.program = program;
  }

  use(): void {
    this.gl.useProgram(this.program);
  }

  uniformLoc(name: string): WebGLUniformLocation | null {
    let loc = this.uniforms.get(name);
    if (loc === undefined) {
      loc = this.gl.getUniformLocation(this.program, name);
      this.uniforms.set(name, loc);
    }
    return loc;
  }

  setMat4(name: string, data: Float32Array): void {
    this.gl.uniformMatrix4fv(this.uniformLoc(name), false, data);
  }

  setVec3(name: string, x: number, y: number, z: number): void {
    this.gl.uniform3f(this.uniformLoc(name), x, y, z);
  }

  private compile(type: number, src: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Impossible de créer un shader.");
    gl.shaderSource(shader, src.trim());
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error("Échec de compilation du shader : " + log);
    }
    return shader;
  }
}
