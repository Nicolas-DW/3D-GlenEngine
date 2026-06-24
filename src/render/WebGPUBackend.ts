import type { FrameData, RenderBackend } from "./RenderBackend";
import type { Mesh } from "./Mesh";
import type { Texture, TextureOptions } from "./Texture";

/** Source WGSL : MVP + éclairage directionnel + texture (équivalent du shader WebGL). */
const WGSL = `
struct Uniforms {
  projection : mat4x4<f32>,
  view : mat4x4<f32>,
  model : mat4x4<f32>,
  color : vec4<f32>,
};
@group(0) @binding(0) var<uniform> u : Uniforms;
@group(1) @binding(0) var albedo : texture_2d<f32>;
@group(1) @binding(1) var albedoSampler : sampler;

struct VsOut {
  @builtin(position) clip : vec4<f32>,
  @location(0) normal : vec3<f32>,
  @location(1) uv : vec2<f32>,
};

@vertex
fn vs(
  @location(0) position : vec3<f32>,
  @location(1) normal : vec3<f32>,
  @location(2) uv : vec2<f32>,
) -> VsOut {
  var out : VsOut;
  let world = u.model * vec4<f32>(position, 1.0);
  out.clip = u.projection * u.view * world;
  // Notre projection est de convention OpenGL (profondeur NDC dans [-1, 1]).
  // WebGPU attend [0, 1] : on remappe z, sinon la moitié proche serait clippée.
  out.clip.z = (out.clip.z + out.clip.w) * 0.5;
  out.normal = (u.model * vec4<f32>(normal, 0.0)).xyz;
  out.uv = uv;
  return out;
}

@fragment
fn fs(in : VsOut) -> @location(0) vec4<f32> {
  let n = normalize(in.normal);
  let lightDir = normalize(vec3<f32>(0.5, 0.8, 0.6));
  let diff = max(dot(n, lightDir), 0.0);
  // Texture par défaut = blanc 1×1, donc blanc × couleur = couleur : pas besoin
  // de brancher, on échantillonne toujours (flux uniforme requis par WGSL).
  let albedoColor = textureSample(albedo, albedoSampler, in.uv).rgb;
  let base = u.color.rgb * albedoColor;
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

const UNIFORM_STRIDE = 256; // une tranche par objet (aligné GPU)

/**
 * Backend WebGPU. Même contrat que WebGL2Backend, mais API moderne (pipeline
 * pré-construit, command encoder, bind groups à offset dynamique).
 *
 * Init ASYNCHRONE : requestAdapter/requestDevice prennent du temps. Le backend
 * se construit de façon synchrone, lance l'init en tâche de fond, et renderFrame
 * est un no-op tant que `ready` est faux (les toutes premières frames sont
 * simplement noires).
 *
 * Périmètre actuel : géométrie + couleur + éclairage + texturing (bind group
 * texture+sampler, texture blanche par défaut quand le matériau n'en a pas).
 * Limite connue : pas de génération de mipmaps (WebGL2 les génère, pas ici).
 *
 * NOTE : non validé au runtime dans cet environnement (sans GPU/navigateur) ;
 * vérifié au typecheck. À exécuter dans un navigateur compatible WebGPU.
 */
export class WebGPUBackend implements RenderBackend {
  readonly name = "WebGPU";

  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private pipeline: GPURenderPipeline | null = null;
  private layout: GPUBindGroupLayout | null = null;
  private texLayout: GPUBindGroupLayout | null = null;
  private whiteBindGroup: GPUBindGroup | null = null;
  private depthView: GPUTextureView | null = null;
  private depthTexture: GPUTexture | null = null;

  private uniformBuffer: GPUBuffer | null = null;
  private bindGroup: GPUBindGroup | null = null;
  private uniformCapacity = 0;

  private readonly meshes = new WeakMap<Mesh, GpuMesh>();
  private readonly textureBindGroups = new WeakMap<Texture, GPUBindGroup>();
  private readonly scratch = new Float32Array(UNIFORM_STRIDE / 4);
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
    this.layout = device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform", hasDynamicOffset: true },
        },
      ],
    });
    // Groupe 1 : la texture du matériau + son sampler.
    this.texLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });

    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.layout, this.texLayout] }),
      vertex: {
        module,
        entryPoint: "vs",
        buffers: [
          { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }] },
          { arrayStride: 12, attributes: [{ shaderLocation: 1, offset: 0, format: "float32x3" }] },
          { arrayStride: 8, attributes: [{ shaderLocation: 2, offset: 0, format: "float32x2" }] },
        ],
      },
      fragment: { module, entryPoint: "fs", targets: [{ format }] },
      primitive: { topology: "triangle-list", cullMode: "back", frontFace: "ccw" },
      depthStencil: { format: "depth24plus", depthWriteEnabled: true, depthCompare: "less" },
    });

    // Texture blanche 1×1 : utilisée par les matériaux SANS texture (blanc = neutre).
    const white = device.createTexture({
      size: [1, 1],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture(
      { texture: white },
      new Uint8Array([255, 255, 255, 255]),
      { bytesPerRow: 4 },
      [1, 1],
    );
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
    // Le depth buffer doit suivre la taille du canvas.
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
    if (!this.ready || !device || !context || !pipeline || !depthView) return;

    const bindGroup = this.ensureUniforms(device, frame.items.length);

    // Une tranche d'uniformes distincte par objet (sinon tous les draws du pass
    // liraient la même dernière valeur).
    for (let i = 0; i < frame.items.length; i++) {
      const item = frame.items[i];
      this.scratch.set(frame.projection, 0);
      this.scratch.set(frame.view, 16);
      this.scratch.set(item.model, 32);
      const c = item.material.color;
      this.scratch[48] = c[0];
      this.scratch[49] = c[1];
      this.scratch[50] = c[2];
      this.scratch[51] = 1;
      device.queue.writeBuffer(this.uniformBuffer!, i * UNIFORM_STRIDE, this.scratch);
    }

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
    for (let i = 0; i < frame.items.length; i++) {
      const item = frame.items[i];
      const gpu = this.uploadMesh(device, item.mesh);
      const texBind = item.material.texture
        ? this.uploadTexture(device, item.material.texture)
        : this.whiteBindGroup!;
      pass.setBindGroup(0, bindGroup, [i * UNIFORM_STRIDE]);
      pass.setBindGroup(1, texBind);
      pass.setVertexBuffer(0, gpu.positions);
      pass.setVertexBuffer(1, gpu.normals);
      pass.setVertexBuffer(2, gpu.uvs);
      pass.setIndexBuffer(gpu.indices, gpu.indexFormat);
      pass.drawIndexed(gpu.indexCount);
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  // --- Ressources. -----------------------------------------------------------

  private ensureUniforms(device: GPUDevice, count: number): GPUBindGroup {
    if (this.bindGroup && this.uniformCapacity >= count) return this.bindGroup;
    this.uniformBuffer?.destroy();
    this.uniformCapacity = Math.max(count, 8);
    this.uniformBuffer = device.createBuffer({
      size: UNIFORM_STRIDE * this.uniformCapacity,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroup = device.createBindGroup({
      layout: this.layout!,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer, offset: 0, size: UNIFORM_STRIDE } },
      ],
    });
    return this.bindGroup;
  }

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

  /** Téléverse une texture (image ou pixels) et renvoie son bind group (cache). */
  private uploadTexture(device: GPUDevice, texture: Texture): GPUBindGroup {
    const cached = this.textureBindGroups.get(texture);
    if (cached) return cached;

    const src = texture.source;
    const [width, height] =
      src.kind === "pixels" ? [src.width, src.height] : imageSize(src.image);

    const gpuTex = device.createTexture({
      size: [width, height],
      format: "rgba8unorm",
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    if (src.kind === "pixels") {
      device.queue.writeTexture(
        { texture: gpuTex },
        src.data,
        { bytesPerRow: width * 4, rowsPerImage: height },
        [width, height],
      );
    } else {
      // copyExternalImageToTexture gère le flipY pour les images.
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
