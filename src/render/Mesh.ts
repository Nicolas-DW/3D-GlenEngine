/**
 * Géométrie GPU : un VAO encapsulant les positions, les normales et les indices.
 * Les attributs sont fixés aux locations 0 (position) et 1 (normale), en accord
 * avec le vertex shader par défaut.
 */
export class Mesh {
  private readonly vao: WebGLVertexArrayObject;
  readonly indexCount: number;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    positions: Float32Array,
    normals: Float32Array,
    indices: Uint16Array,
  ) {
    this.indexCount = indices.length;

    const vao = gl.createVertexArray();
    if (!vao) throw new Error("Impossible de créer le VAO.");
    this.vao = vao;
    gl.bindVertexArray(vao);

    this.attribBuffer(0, positions, 3);
    this.attribBuffer(1, normals, 3);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);
  }

  draw(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
  }

  private attribBuffer(location: number, data: Float32Array, size: number): void {
    const gl = this.gl;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }
}
