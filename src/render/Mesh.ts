/**
 * Géométrie GPU : un VAO encapsulant positions, normales, UV et indices.
 * Locations des attributs : 0 = position, 1 = normale, 2 = UV (optionnel),
 * en accord avec le vertex shader par défaut.
 */
export class Mesh {
  private readonly vao: WebGLVertexArrayObject;
  private readonly indexType: number;
  readonly indexCount: number;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    positions: Float32Array,
    normals: Float32Array,
    indices: Uint16Array | Uint32Array,
    uvs?: Float32Array,
  ) {
    this.indexCount = indices.length;
    // glTF peut indexer en 16 ou 32 bits selon le nombre de sommets.
    this.indexType =
      indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;

    const vao = gl.createVertexArray();
    if (!vao) throw new Error("Impossible de créer le VAO.");
    this.vao = vao;
    gl.bindVertexArray(vao);

    this.attribBuffer(0, positions, 3);
    this.attribBuffer(1, normals, 3);
    if (uvs) this.attribBuffer(2, uvs, 2);

    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);
  }

  draw(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.indexCount, this.indexType, 0);
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
