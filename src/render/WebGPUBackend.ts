import type { FrameData, Renderable, RenderBackend } from "./RenderBackend";
import type { Mesh } from "./Mesh";
import type { Texture, TextureOptions } from "./Texture";

/**
 * Source WGSL : MVP + éclairage + texture, en rendu INSTANCIÉ.
 * proj/view sont des uniformes globaux ; la matrice modèle (4 colonnes) et la
 * couleur sont des attributs PAR INSTANCE (locations 3..7).
 */
const WGSL = `
struct Globals {
  projection : mat4x4<f32>,
  view : mat4x4<f32>,
};
@group(0) @binding(0) var<uniform> g : Globals;
@group(1) @binding(0) var albedo : texture_2d<f32>;
@group(1) @binding(1) var albedoSampler : sampler;

struct VsIn {
  @location(0) position : vec3<f32>,
  @location(1) normal : vec3<f32>,
  @location(2) uv : vec2<f32>,
  // Matrice modèle de l'instance (4 colonnes) + couleur.
  @location(3) m0 : vec4<f32>,
  @location(4) m1 : vec4<f32>,
  @location(5) m2 : vec4<f32>,
  @location(6) m3 : vec4<f32>,
  @location(7) color : vec4<f32>,
};

struct VsOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) normal : vec3<f32>,
  @location(1) uv : vec2<f32>,
  @location(2) color : vec3<f32>,
};

@vertex
fn vs(in : VsIn) -> VsOut {
  let model = mat4x4<f32>(in.m0, in.m1, in.m2, in.m3);
  var out : VsOut;
  let world = model * vec4<f32>(in.position, 1.0);
  out.clip = g.projection * g.view * world;
  // Profondeur OpenGL [-1,1] -> WebGPU [0,1].
  out.clip.z = (out.clip.z + out.clip.w) * 0.5;
  out.normal = (model * vec4<f32>(in.normal, 0.0)).xyz;
  out.uv = in.uv;
  out.color = in.color.rgb;
  return out;
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4<f32> {
  let n = normalize(in.normal);
  let lightDir = normalize(vec3<f32>(0.5, 0.8, 0.6));
  let diff = max(dot(n, lightDir), 0.0);
  let albedoColor = textureSample(albedo, albedoSampler, in.uv).rgb;
  let base = in.color * albedoColor; // texture blanche par défaut = couleur seule
  return vec4<f32>(base * (0.25 + 0.75 * diff), 1.0);
}
`;

interface GpuMesh {
  positions: GPUBuffer;
  normals: GPUBuffer;
  uvs: GPUBuffer;
  indices: GPUBuffer;
  indexCount: number;
  indexFormat: GPUIndexFormat;
}

const FLOATS_PER_INSTANCE = 20; // matrice modèle (16) + couleur (4)
const INSTANCE_STRIDE = FLOATS_PER_INSTANCE * 4; // octets

/**
 * Backend WebGPU instancié (seul backend depuis le retrait de WebGL2).
 *
 * À chaque frame, les objets sont GROUPÉS par (mesh, texture) ; chaque groupe
 * est dessiné en un seul appel instancié. Des centaines d'objets partageant une
 * géométrie (les billes) = 1 draw call au lieu de N.
 *
 * Init ASYNCHRONE : renderFrame est un no-op tant que `ready` est faux.
 *
 * Limite connue : pas de génération de mipmaps.
 *
 * NOTE : vérifié au typecheck, non validé au runtime dans cet environnement
 * (sans GPU/navigateur). À exécuter dans un navigateur compatible WebGPU.
 */
export class WebGPUBackend implements RenderBackend {
  readonly name = "WebGPU";

  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private texLayout: GPUBindGroupLayout | null = null;
  private whiteBindGroup: GPUBindGroup | null = null;
  private depthView: GPUTextureView | null = null;
  private depthTexture: GPUTexture | null = null;

  private globalsBuffer: GPUBuffer | null = null;
  private globalsBindGroup: GPUBindGroup | null = null;
  private instanceBuffer: GPUBuffer | null = null;
  private instanceScratch = new Float32Array(0);
  private instanceCapacity = 0;

  private readonly meshes = new WeakMap<Mesh, GpuMesh>();
  private readonly textureBindGroups = new WeakMap<Texture, GPUBindGroup>();
  private ready = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    void this.init();
  }

  private async init(): Promise<void> {
    if (!navigator.gpu) throw new Error("WebGPU non supporté par ce navigateur.");
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("Aucun adaptateur WebGPU disponible.");
    const device = await adapter.requestDevice();
    const context = this.canvas.getContext("webgpu");
    if (!context) throw new Error("Contexte WebGPU indisponible.");

    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: "opaque" });
    this.device = device;
    this.context = context;

    const module = device.createShaderModule({ code: WGSL });

    // Groupe 0 : uniformes globaux (projection + vue).
    const globalsLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }],
    });
    this.globalsBuffer = device.createBuffer({
      size: 128, // 2 mat4x4
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.globalsBindGroup = device.createBindGroup({
      layout: globalsLayout,
      entries: [{ binding: 0, resource: { buffer: this.globalsBuffer } }],
    });

    // Groupe 1 : texture du matériau + sampler.
    this.texLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });

    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [globalsLayout, this.texLayout] }),
      vertex: {
        module,
        entryPoint: "vs",
        buffers: [
          { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] },
          { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: "float32x3" }] },
          { arrayStride: 8, attributes: [{ shaderLocation: 2, offset: 0, format: "float32x2" }] },
          {
            arrayStride: INSTANCE_STRIDE,
            stepMode: "instance",
            attributes: [
              { shaderLocation: 3, offset: 0, format: "float32x4" },
              { shaderLocation: 4, offset: 16, format: "float32x4" },
              { shaderLocation: 5, offset: 32, format: "float32x4" },
              { shaderLocation: 6, offset: 48, format: "float32x4" },
              { shaderLocation: 7, offset: 64, format: "float32x4" },
            ],
          },
        ],
      },
      fragment: { module, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list", cullMode: "back", frontFace: "ccw" },
      depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
    });

    // Texture blanche 1×1 : matériaux sans texture (blanc = neutre).
    const white = device.createTexture({
      size: [1, 1],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture({ texture: white }, new Uint8Array([255, 255, 255, 255]), { bytesPerRow: 4 }, [1, 1]);
    this.whiteBindGroup = this.makeTextureBindGroup(
      device,
      white.createView(),
      device.createSampler({ magFilter: "linear", minFilter: "linear" }),
    );

    this.resize();
    this.ready = true;
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    if (!this.device) return;
    this.depthTexture?.destroy();
    this.depthTexture = this.device.createTexture({
      size: [this.canvas.width, this.canvas.height],
      format: "depth24plus",
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depthView = this.depthTexture.createView();
  }

  renderFrame(frame: FrameData): void {
    const device = this.device;
    const context = this.context;
    const pipeline = this.pipeline;
    const depthView = this.depthView;
    const globals = this.globalsBindGroup;
    if (!this.ready || !device || !context || !pipeline || !depthView || !globals) return;

    // Uniformes globaux.
    device.queue.writeBuffer(this.globalsBuffer!, 0, frame.projection);
    device.queue.writeBuffer(this.globalsBuffer!, 64, frame.view);

    // Regrouper par mesh puis texture, et remplir le buffer d'instances.
    const draws = this.buildInstances(device, frame.items);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.getCurrentTexture().createView(),
          clearValue: { r: 0.043, g: 0.051, b: 0.071, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
      depthStencilAttachment: {
        view: depthView,
        depthClearValue: 1,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, globals);
    for (const d of draws) {
      const gpu = this.uploadMesh(device, d.mesh);
      pass.setBindGroup(1, d.texture ? this.uploadTexture(device, d.texture) : this.whiteBindGroup!);
      pass.setVertexBuffer(0, gpu.positions);
      pass.setVertexBuffer(1, gpu.normals);
      pass.setVertexBuffer(2, gpu.uvs);
      pass.setVertexBuffer(3, this.instanceBuffer!, d.first * INSTANCE_STRIDE);
      pass.setIndexBuffer(gpu.indices, gpu.indexFormat);
      pass.drawIndexed(gpu.indexCount, d.count); // 1 appel, d.count instances
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  // --- Instances. ------------------------------------------------------------

  private buildInstances(
    device: GPUDevice,
    items: Renderable[],
  ): { mesh: Mesh; texture: Texture | null; first: number; count: number }[] {
    const groups = new Map<Mesh, Map<Texture | null, Renderable[]>>();
    for (const item of items) {
      let byTexture = groups.get(item.mesh);
      if (!byTexture) {
        byTexture = new Map();
        groups.set(item.mesh, byTexture);
      }
      const texture = item.material.texture ?? null;
      const bucket = byTexture.get(texture);
      if (bucket) bucket.push(item);
      else byTexture.set(texture, [item]);
    }

    this.ensureInstanceCapacity(device, items.length);
    const data = this.instanceScratch;
    const draws: { mesh: Mesh; texture: Texture | null; first: number; count: number }[] = [];

    let index = 0;
    for (const [mesh, byTexture] of groups) {
      for (const [texture, bucket] of byTexture) {
        const first = index;
        for (const item of bucket) {
          const o = index * FLOATS_PER_INSTANCE;
          data.set(item.model, o); // 16 floats, column-major
          const c = item.material.color;
          data[o + 16] = c[0];
          data[o + 17] = c[1];
          data[o + 18] = c[2];
          data[o + 19] = 1;
          index++;
        }
        draws.push({ mesh, texture, first, count: bucket.length });
      }
    }

    if (index > 0) {
      device.queue.writeBuffer(this.instanceBuffer!, 0, data, 0, index * FLOATS_PER_INSTANCE);
    }
    return draws;
  }

  private ensureInstanceCapacity(device: GPUDevice, count: number): void {
    if (this.instanceBuffer && this.instanceCapacity >= count) return;
    this.instanceCapacity = Math.max(count, 256);
    this.instanceBuffer?.destroy();
    this.instanceBuffer = device.createBuffer({
      size: this.instanceCapacity * INSTANCE_STRIDE,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.instanceScratch = new Float32Array(this.instanceCapacity * FLOATS_PER_INSTANCE);
  }

  // --- Ressources. -----------------------------------------------------------

  private uploadMesh(device: GPUDevice, mesh: Mesh): GpuMesh {
    const cached = this.meshes.get(mesh);
    if (cached) return cached;

    const uvs = mesh.uvs ?? new Float32Array((mesh.positions.length / 3) * 2);
    const gpu: GpuMesh = {
      positions: makeBuffer(device, mesh.positions, GPUBufferUsage.VERTEX),
      normals: makeBuffer(device, mesh.normals, GPUBufferUsage.VERTEX),
      uvs: makeBuffer(device, uvs, GPUBufferUsage.VERTEX),
      indices: makeBuffer(device, mesh.indices, GPUBufferUsage.INDEX),
      indexCount: mesh.indexCount,
      indexFormat: mesh.uint32Indices ? "uint32" : "uint16",
    };
    this.meshes.set(mesh, gpu);
    return gpu;
  }

  private uploadTexture(device: GPUDevice, texture: Texture): GPUBindGroup {
    const cached = this.textureBindGroups.get(texture);
    if (cached) return cached;

    const src = texture.source;
    const [width, height] = src.kind === "pixels" ? [src.width, src.height] : imageSize(src.image);

    const gpuTex = device.createTexture({
      size: [width, height],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });

    if (src.kind === "pixels") {
      device.queue.writeTexture(
        { texture: gpuTex },
        src.data,
        { bytesPerRow: width * 4, rowsPerImage: height },
        [width, height],
      );
    } else {
      device.queue.copyExternalImageToTexture(
        { source: src.image, flipY: texture.options.flipY ?? false },
        { texture: gpuTex },
        [width, height],
      );
    }

    const bindGroup = this.makeTextureBindGroup(
      device,
      gpuTex.createView(),
      device.createSampler(samplerDescriptor(texture.options)),
    );
    this.textureBindGroups.set(texture, bindGroup);
    return bindGroup;
  }

  private makeTextureBindGroup(
    device: GPUDevice,
    view: GPUTextureView,
    sampler: GPUSampler,
  ): GPUBindGroup {
    return device.createBindGroup({
      layout: this.texLayout!,
      entries: [
        { binding: 0, resource: view },
        { binding: 1, resource: sampler },
      ],
    });
  }
}

/** Crée un GPUBuffer initialisé (taille alignée sur 4 octets, requis par WebGPU). */
function makeBuffer(
  device: GPUDevice,
  data: Float32Array | Uint16Array | Uint32Array,
  usage: GPUBufferUsageFlags,
): GPUBuffer {
  const size = (data.byteLength + 3) & ~3;
  const buffer = device.createBuffer({ size, usage, mappedAtCreation: true });
  new Uint8Array(buffer.getMappedRange()).set(
    new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
  );
  buffer.unmap();
  return buffer;
}

/** Options de texture neutres -> descripteur de sampler WebGPU. */
function samplerDescriptor(opts: TextureOptions): GPUSamplerDescriptor {
  const filter: GPUFilterMode = opts.filter === "nearest" ? "nearest" : "linear";
  const wrap: GPUAddressMode = opts.wrap === "clamp" ? "clamp-to-edge" : "repeat";
  return { magFilter: filter, minFilter: filter, addressModeU: wrap, addressModeV: wrap };
}

/** Dimensions d'une source d'image (gère HTMLImageElement et les autres). */
function imageSize(src: TexImageSource): [number, number] {
  if (src instanceof HTMLImageElement) return [src.naturalWidth, src.naturalHeight];
  const s = src as { width?: number; height?: number; displayWidth?: number; displayHeight?: number };
  return [s.width ?? s.displayWidth ?? 1, s.height ?? s.displayHeight ?? 1];
}
