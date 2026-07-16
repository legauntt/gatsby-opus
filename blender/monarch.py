"""
Procedural hyper-realistic monarch butterfly (Danaus plexippus) for the web.

Runs headless in Blender 5.2:
    blender -b --python blender/monarch.py -- [render|export|both]

Outputs:
    static/models/monarch.glb     - the web asset (geometry + PBR textures + named anim clips)
    blender/renders/hero.png      - a look-dev render for iteration
    blender/textures/*.png        - baked numpy textures (albedo / normal / roughness)

Design notes:
  * Wings are built in a shared normalized [0,1]^2 UV space from a monarch
    outline, so the MESH silhouette and the numpy TEXTURE use the exact same
    outline -> the pattern lines up with the geometry for free.
  * Everything a browser glTF can't do (node materials, hair, transmission
    tricks) is baked to standard PBR textures (baseColor / normal / roughness).
  * One armature drives L/R fore- and hind-wings; meshes are skinned rigidly
    (each wing 100% to its bone) which exports cleanly as glTF skins + clips.
"""

import bpy
import bmesh
import numpy as np
import sys
import os
from math import sin, cos, pi, radians, sqrt

import mathutils
from mathutils import Vector, Euler

# --------------------------------------------------------------------------- #
# Paths / args
# --------------------------------------------------------------------------- #
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
TEX_DIR = os.path.join(HERE, "textures")
REND_DIR = os.path.join(HERE, "renders")
MODEL_DIR = os.path.join(REPO, "static", "but_dance")
for d in (TEX_DIR, REND_DIR, MODEL_DIR):
    os.makedirs(d, exist_ok=True)

argv = sys.argv
MODE = "both"
if "--" in argv:
    extra = argv[argv.index("--") + 1:]
    if extra:
        MODE = extra[0]

TEX_RES = 1024        # bump to 2048 for final
DO_RENDER = MODE in ("render", "both")
DO_EXPORT = MODE in ("export", "both")

# Monarch measurements (meters; glTF is Y-up meters). ~95mm wingspan.
MM = 0.001
FORE_SPAN = 47 * MM   # root->apex of one forewing
FORE_CHORD = 38 * MM
HIND_SPAN = 34 * MM
HIND_CHORD = 34 * MM
CAMBER = 3.0 * MM     # gentle dome so wings aren't flat cards

# --------------------------------------------------------------------------- #
# Colors (linear-ish sRGB values; Blender expects linear, we convert)
# --------------------------------------------------------------------------- #
def srgb_to_linear(c):
    c = np.asarray(c, dtype=np.float32)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

# Palette tuned to the lepidoptery checklist: desaturated monarch orange,
# black that is never pure #000, cream spots that are never pure #fff.
ORANGE = np.array([0.929, 0.522, 0.129])      # ~#ED8521 monarch ground
ORANGE_LIGHT = np.array([0.976, 0.643, 0.239])  # lighter cell centers
ORANGE_DEEP = np.array([0.796, 0.376, 0.098])   # burnt junction near base
BLACK = np.array([0.086, 0.067, 0.055])       # ~#161210 margins/veins
BLACK_BASE = np.array([0.102, 0.078, 0.063])  # ~#1A1410 basal wash
WHITE = np.array([0.953, 0.933, 0.878])       # ~#F3EEE0 cream spots
UNDER_TAN = np.array([0.796, 0.635, 0.435])   # paler tan underside


def smooth_noise(res, cells, seed, blur=2):
    """A soft value-noise field in [-1,1], smoother than blocky kron."""
    rng = np.random.default_rng(seed)
    small = rng.normal(0, 1, (cells, cells))
    # bilinear upscale via numpy repeat + a couple of box blurs
    reps = int(np.ceil(res / cells))
    big = np.kron(small, np.ones((reps, reps)))[:res, :res]
    for _ in range(blur):
        big = (big
               + np.roll(big, 1, 0) + np.roll(big, -1, 0)
               + np.roll(big, 1, 1) + np.roll(big, -1, 1)) / 5.0
    m = np.max(np.abs(big)) + 1e-9
    return big / m

# --------------------------------------------------------------------------- #
# Wing outlines in normalized [0,1]^2 (u = span outward, v = fore/aft)
# --------------------------------------------------------------------------- #
# Produced, slightly falcate apex (tip dropped below the costa line) + near-
# straight termen -> reads as an elongated monarch forewing, not a rounded fan.
FOREWING_OUTLINE = [
    (0.00, 0.58),
    (0.14, 0.64), (0.34, 0.70), (0.55, 0.75),      # costa: near-straight, gentle rise
    (0.74, 0.79), (0.89, 0.815),                   # (was arching to 0.91 -- too domed)
    (0.965, 0.775),                                # subapical shoulder
    (1.00, 0.665),                                 # produced apex, below costa = falcate
    (0.955, 0.60),                                 # concave notch under apex (the hook)
    (0.865, 0.52), (0.73, 0.40), (0.58, 0.29),     # near-straight-to-concave termen
    (0.43, 0.18), (0.28, 0.12),                    # tornus
    (0.15, 0.135), (0.05, 0.27), (0.012, 0.43),    # inner margin back to root
]

# Flatter costa (teardrop) + a small anal lobe where it meets the abdomen.
HINDWING_OUTLINE = [
    (0.00, 0.50),                                  # root at body
    (0.11, 0.62), (0.28, 0.685), (0.46, 0.71),     # flatter, straighter costa
    (0.63, 0.70), (0.79, 0.655), (0.905, 0.575),   # front shoulder
    (0.965, 0.47),                                 # rounded outer apex
    (0.945, 0.35), (0.88, 0.255), (0.78, 0.185),   # rounded outer margin
    (0.64, 0.135), (0.49, 0.11),                   # toward tornus
    (0.35, 0.105), (0.24, 0.135),                  # small anal lobe bump
    (0.13, 0.175), (0.04, 0.33),                   # straighter inner (abdominal) margin
]


def _poly_np(outline):
    return np.array(outline, dtype=np.float64)


def points_inside(outline, pts):
    """Vectorized even-odd point-in-polygon. pts: (N,2). returns bool (N,)."""
    poly = _poly_np(outline)
    x, y = pts[:, 0], pts[:, 1]
    inside = np.zeros(len(pts), dtype=bool)
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        cond = ((yi > y) != (yj > y)) & (
            x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi
        )
        inside ^= cond
        j = i
    return inside


def dist_to_outline(outline, pts):
    """Min distance from each point to the polygon boundary. pts (N,2)->(N,)."""
    poly = _poly_np(outline)
    n = len(poly)
    best = np.full(len(pts), 1e9)
    px, py = pts[:, 0], pts[:, 1]
    for i in range(n):
        a = poly[i]
        b = poly[(i + 1) % n]
        abx, aby = b[0] - a[0], b[1] - a[1]
        L2 = abx * abx + aby * aby + 1e-12
        t = ((px - a[0]) * abx + (py - a[1]) * aby) / L2
        t = np.clip(t, 0.0, 1.0)
        cx = a[0] + t * abx
        cy = a[1] + t * aby
        d = np.hypot(px - cx, py - cy)
        best = np.minimum(best, d)
    return best


# --------------------------------------------------------------------------- #
# Mesh: wing built from a grid clipped to the outline
# --------------------------------------------------------------------------- #
def _catmull_rom_closed(points, samples_per_seg=16):
    """Resample a closed polygon into a smooth loop via Catmull-Rom."""
    P = np.array(points, dtype=np.float64)
    n = len(P)
    out = []
    for i in range(n):
        p0 = P[(i - 1) % n]
        p1 = P[i]
        p2 = P[(i + 1) % n]
        p3 = P[(i + 2) % n]
        for s in range(samples_per_seg):
            t = s / samples_per_seg
            t2 = t * t
            t3 = t2 * t
            a = 0.5 * (2 * p1 + (-p0 + p2) * t +
                       (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
                       (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
            out.append((a[0], a[1]))
    return out


def build_wing_mesh(name, outline, span, chord, side=+1, y_shift=0.0):
    """
    Build a wing whose silhouette IS the smooth monarch outline. We construct
    the mesh in normalized (u,v,0) space so a vertex's XY equals its UV, then:
      outline -> smooth loop -> single ngon -> triangulate -> subdivide (adds
      interior verts) -> read UV from XY -> remap XY to world size + camber dome.
    Rigid-skinned + flat-ish, so fan topology is fine; the edge is crisp.
    """
    loop_uv = _catmull_rom_closed(outline, samples_per_seg=14)

    bm = bmesh.new()
    bverts = [bm.verts.new((u, v, 0.0)) for (u, v) in loop_uv]
    try:
        bm.faces.new(bverts)
    except ValueError:
        # duplicate/degenerate point guard
        bmesh.ops.remove_doubles(bm, verts=bverts, dist=1e-6)
        bm.faces.new(bm.verts[:])

    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    # densify interior so the camber dome reads and normals interpolate well
    for _ in range(3):
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1,
                                  use_grid_fill=True)

    uv_layer = bm.loops.layers.uv.new("UVMap")
    # remap each vert: xy currently in (u,v). Set UV, then move to world.
    for f in bm.faces:
        for loop in f.loops:
            u, v = loop.vert.co.x, loop.vert.co.y
            loop[uv_layer].uv = (u, v)

    for vert in bm.verts:
        u = min(max(vert.co.x, 0.0), 1.0)
        v = min(max(vert.co.y, 0.0), 1.0)
        x = vert.co.x * span
        y = (vert.co.y - 0.5) * chord + y_shift
        dome = sin(pi * u) * sin(pi * v)
        z = CAMBER * dome
        vert.co = Vector((x, y, z))

    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for p in mesh.polygons:
        p.use_smooth = True
    return obj


# --------------------------------------------------------------------------- #
# Textures (numpy -> Blender image -> PNG). Shared normalized space.
# --------------------------------------------------------------------------- #
def _polyline(points, res):
    """Return list of (x,y) segment endpoints in pixel space for a polyline."""
    return points


def rasterize_veins(res, outline, veins, base_halfwidth):
    """Return a float mask (res,res) 0..1 where veins are, taper toward tips."""
    ys, xs = np.mgrid[0:res, 0:res]
    px = xs.astype(np.float64) / (res - 1)
    py = 1.0 - ys.astype(np.float64) / (res - 1)  # image row0 = top (v=1)
    mask = np.zeros((res, res), dtype=np.float64)
    pts = np.column_stack([px.ravel(), py.ravel()])
    for vein in veins:
        # vein is a list of (u,v, width_scale)
        for i in range(len(vein) - 1):
            ax, ay, aw = vein[i]
            bx, by, bw = vein[i + 1]
            abx, aby = bx - ax, by - ay
            L2 = abx * abx + aby * aby + 1e-12
            t = ((pts[:, 0] - ax) * abx + (pts[:, 1] - ay) * aby) / L2
            t = np.clip(t, 0.0, 1.0)
            cx = ax + t * abx
            cy = ay + t * aby
            d = np.hypot(pts[:, 0] - cx, pts[:, 1] - cy)
            w = (aw + (bw - aw) * t) * base_halfwidth
            seg = np.clip(1.0 - d / (w + 1e-9), 0.0, 1.0)
            m = mask.ravel()
            np.maximum(m, seg, out=m)
            mask = m.reshape(res, res)
    return mask


def _curved(base, mid, tip, w0=1.0, w1=0.62, w2=0.32, bow=0.0):
    """A gently bowed 3-point vein polyline with tapering width."""
    mx = mid[0] + (tip[1] - base[1]) * bow
    my = mid[1] - (tip[0] - base[0]) * bow
    return [(base[0], base[1], w0), (mx, my, w1), (tip[0], tip[1], w2)]


def forewing_veins():
    """
    Monarch forewing venation (topologically faithful, simplified):
    a discal cell near the base, main radiating veins (R/M/Cu/A), the radial
    sector branching R1-R5 toward the apex, plus a discal crossvein.
    """
    base = (0.045, 0.50)
    veins = []
    # --- discal cell: two long veins from base that a crossvein closes ---
    cell_top = (0.50, 0.63)
    cell_bot = (0.50, 0.40)
    veins.append([(base[0], base[1], 1.0), (0.26, 0.60, 0.8), cell_top + (0.5,)])
    veins.append([(base[0], base[1], 1.0), (0.26, 0.43, 0.8), cell_bot + (0.5,)])
    veins.append([cell_top + (0.5,), (0.50, 0.515, 0.45), cell_bot + (0.5,)])  # crossvein
    # --- radial sector -> apex fan (R1..R5) beyond the cell ---
    for tx, ty in [(0.99, 0.80), (0.995, 0.70), (0.975, 0.60), (0.92, 0.52)]:
        veins.append(_curved(cell_top, ((cell_top[0] + tx) / 2, (cell_top[1] + ty) / 2),
                             (tx, ty), w0=0.55, w1=0.42, w2=0.24, bow=0.05))
    # --- media veins M1-M3 from the cell end ---
    for tx, ty in [(0.86, 0.44), (0.74, 0.35), (0.62, 0.29)]:
        veins.append(_curved(cell_bot, ((cell_bot[0] + tx) / 2, (cell_bot[1] + ty) / 2),
                             (tx, ty), w0=0.55, w1=0.42, w2=0.22, bow=-0.04))
    # --- cubitus + anal from base toward the trailing margin ---
    for tx, ty in [(0.50, 0.22), (0.34, 0.17), (0.20, 0.20)]:
        veins.append(_curved(base, ((base[0] + tx) / 2, (base[1] + ty) / 2 - 0.02),
                             (tx, ty), w0=0.9, w1=0.6, w2=0.28, bow=-0.03))
    # subcosta hugging the leading edge
    veins.append(_curved(base, (0.45, 0.72), (0.82, 0.83), w0=0.7, w1=0.5, w2=0.3, bow=0.03))
    return veins


def hindwing_veins():
    """Hindwing venation: discal cell + radiating veins to the scalloped margin."""
    base = (0.05, 0.50)
    veins = []
    cell_top = (0.42, 0.60)
    cell_bot = (0.42, 0.41)
    veins.append([(base[0], base[1], 1.0), (0.24, 0.58, 0.8), cell_top + (0.5,)])
    veins.append([(base[0], base[1], 1.0), (0.24, 0.44, 0.8), cell_bot + (0.5,)])
    veins.append([cell_top + (0.5,), (0.42, 0.505, 0.45), cell_bot + (0.5,)])
    for tx, ty in [(0.93, 0.58), (0.88, 0.70), (0.74, 0.78), (0.58, 0.80)]:
        veins.append(_curved(cell_top, ((cell_top[0] + tx) / 2, (cell_top[1] + ty) / 2),
                             (tx, ty), w0=0.55, w1=0.42, w2=0.24, bow=0.05))
    for tx, ty in [(0.90, 0.44), (0.80, 0.30), (0.62, 0.20), (0.44, 0.16)]:
        veins.append(_curved(cell_bot, ((cell_bot[0] + tx) / 2, (cell_bot[1] + ty) / 2),
                             (tx, ty), w0=0.55, w1=0.42, w2=0.22, bow=-0.05))
    veins.append(_curved(base, (0.24, 0.30), (0.40, 0.16), w0=0.8, w1=0.55, w2=0.26, bow=-0.03))
    return veins


def _sstep(edges0, edges1, x):
    t = np.clip((x - edges0) / (edges1 - edges0 + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


def _spot_centers(outline, idx_lo, idx_hi, spacing):
    """Walk the outer-margin portion of the outline, return (x,y,nx,ny) samples
    at ~`spacing` arc-length apart, with the inward unit normal at each."""
    poly = _poly_np(outline)
    cen = poly.mean(axis=0)
    pts = []
    acc = 0.0
    carry = 0.0
    for k in range(idx_lo, idx_hi):
        a = poly[k % len(poly)]
        b = poly[(k + 1) % len(poly)]
        seg = b - a
        L = float(np.hypot(seg[0], seg[1]))
        if L < 1e-6:
            continue
        d = seg / L
        n = np.array([-d[1], d[0]])
        if np.dot(n, cen - (a + b) / 2) < 0:
            n = -n  # face inward
        s = carry
        while s < L:
            p = a + d * s
            pts.append((p[0], p[1], n[0], n[1]))
            s += spacing
        carry = s - L
        acc += L
    return pts


def make_wing_textures(kind, outline, veins, res=TEX_RES, male_spot=False):
    """
    Generate albedo(RGBA), normal(RGBA), roughness(RGBA) numpy arrays for a wing,
    in image order (row0 = top). Implements the monarch recipe: cell gradient +
    fine per-scale noise, branching veins with a discal cell, a variable-width
    black margin, and the signature DOUBLE row of cream marginal spots.
    """
    ys, xs = np.mgrid[0:res, 0:res]
    u = xs.astype(np.float64) / (res - 1)
    v = 1.0 - ys.astype(np.float64) / (res - 1)
    pts = np.column_stack([u.ravel(), v.ravel()])

    inside = points_inside(outline, pts).reshape(res, res)
    edist = dist_to_outline(outline, pts).reshape(res, res)

    # ---- base cells: orange, lighter mid, deeper toward base, fine scales ----
    base_pt = (0.05, 0.5)
    rbase = np.hypot(u - base_pt[0], v - base_pt[1])
    lightf = _sstep(0.12, 0.5, rbase) * (1 - _sstep(0.5, 0.85, rbase))
    col = (ORANGE[None, None, :]
           + (ORANGE_LIGHT - ORANGE)[None, None, :] * lightf[..., None] * 0.7)
    deep = _sstep(0.18, 0.0, rbase)  # near base
    col = col * (1 - 0.35 * deep[..., None]) + ORANGE_DEEP[None, None, :] * (0.35 * deep[..., None])
    # per-scale noise: fine brightness jitter (±9%), membrane only
    scale_noise = smooth_noise(res, cells=res // 6, seed=(3 if kind == "fore" else 8), blur=1)
    fine_noise = smooth_noise(res, cells=res // 3, seed=(4 if kind == "fore" else 9), blur=1)
    jitter = 1.0 + 0.09 * scale_noise + 0.05 * fine_noise
    col = col * jitter[..., None]

    if kind == "hind":
        col = col * 1.04  # hindwing reads a touch lighter

    # ---- variable-width black margin band (wide enough to hold both spot rows) ----
    if kind == "fore":
        # thin along costa, balloons toward the apex, medium on outer/trailing
        apex_r = np.hypot(u - 1.0, v - 0.68)
        w_field = 0.045 + 0.090 * _sstep(0.42, 0.02, apex_r)
        w_field = np.clip(w_field, 0.045, 0.135)
    else:
        w_field = np.full((res, res), 0.078)
    margin_amt = _sstep(1.4 / res, 0.0, edist - w_field)  # 1 inside band, 0 out

    # ---- veins: thin & numerous (accuracy), backed by wider smoky dusting (LOD) ----
    vein_mask = rasterize_veins(res, outline, veins, base_halfwidth=0.0065)
    smoky = np.clip(rasterize_veins(res, outline, veins, base_halfwidth=0.022) - vein_mask, 0, 1) * 0.32

    black_total = np.clip(margin_amt + vein_mask + smoky, 0, 1)
    col = col * (1 - black_total[..., None]) + BLACK[None, None, :] * black_total[..., None]
    # basal wash: deep near the very root
    wash = _sstep(0.10, 0.0, rbase)
    col = col * (1 - 0.5 * wash[..., None]) + BLACK_BASE[None, None, :] * (0.5 * wash[..., None])

    # ---- double row of cream spots along the outer margin ----
    white_mask = np.zeros((res, res))

    def stamp(cx, cy, radius, elong, strength=1.0):
        nonlocal col, white_mask
        dx = (u - cx)
        dy = (v - cy) / elong
        d = np.hypot(dx, dy)
        spot = _sstep(radius, radius * 0.55, d) * strength
        col = col * (1 - spot[..., None]) + WHITE[None, None, :] * spot[..., None]
        white_mask = np.maximum(white_mask, spot)

    # outer-margin index ranges for the current outlines (apex->tornus / shoulder->lobe)
    if kind == "fore":
        idx_lo, idx_hi = 8, 14
        submarg_r, marg_r = 0.021, 0.013
    else:
        idx_lo, idx_hi = 6, 15
        submarg_r, marg_r = 0.021, 0.012
    centers = _spot_centers(outline, idx_lo, idx_hi, spacing=0.070)
    for (bx, by, nx, ny) in centers:
        # both rows offset INWARD so they land inside the black band; submarginal
        # is larger + tangentially elongated, marginal smaller nearer the edge
        stamp(bx + nx * 0.040, by + ny * 0.040, submarg_r, 1.4)
        stamp(bx + nx * 0.018, by + ny * 0.018, marg_r, 1.15)

    # forewing apex: a clear diagonal band of cream spots across the black cap,
    # with pale-orange subapical spots toward the costa
    if kind == "fore":
        for (sx, sy, rad) in [(0.87, 0.80, 0.022), (0.915, 0.72, 0.022), (0.945, 0.63, 0.020)]:
            d = np.hypot(u - sx, v - sy)
            spot = _sstep(rad, rad * 0.5, d)
            col = col * (1 - spot[..., None]) + WHITE[None, None, :] * spot[..., None]
            white_mask = np.maximum(white_mask, spot)
        for (sx, sy, rad) in [(0.82, 0.83, 0.016), (0.785, 0.775, 0.014)]:
            d = np.hypot(u - sx, v - sy)
            spot = _sstep(rad, rad * 0.5, d)
            col = col * (1 - spot[..., None]) + ORANGE_LIGHT[None, None, :] * spot[..., None]

    # male androconial scent patch on a hindwing vein (Cu2)
    if male_spot and kind == "hind":
        d = np.hypot((u - 0.46) / 1.3, v - 0.40)
        spot = _sstep(0.032, 0.018, d)
        col = col * (1 - spot[..., None]) + BLACK[None, None, :] * spot[..., None]
        vein_mask = np.maximum(vein_mask, spot * 0.8)

    # paint OUTSIDE the wing margin-black so the alpha cut has no bright halo
    col = np.where(inside[..., None], col, BLACK[None, None, :])

    # ---- alpha: opaque inside, ~2px feather at the very edge ----
    alpha = np.where(inside, np.clip(edist / 0.003, 0.0, 1.0), 0.0)

    rgba = np.zeros((res, res, 4), dtype=np.float32)
    rgba[..., :3] = np.clip(col, 0, 1)   # display sRGB; np_to_image linearizes
    rgba[..., 3] = alpha

    # ---- normal map: ROUNDED vein ridges + gentle cell doming + micro noise ----
    # Blur the vein mask so ridges have a rounded cross-section (a flat-topped
    # plateau has zero gradient across the top -> the relief would be invisible).
    vein_soft = vein_mask.copy()
    for _ in range(6):
        vein_soft = (vein_soft
                     + np.roll(vein_soft, 1, 0) + np.roll(vein_soft, -1, 0)
                     + np.roll(vein_soft, 1, 1) + np.roll(vein_soft, -1, 1)) / 5.0
    quilt = (1 - vein_mask) * (0.5 + 0.5 * np.sin(u * 22) * np.sin(v * 20))
    # (no high-freq span ripple -- it moires/shimmers under mips while flapping)
    height = (0.9 * vein_soft + 0.30 * margin_amt + 0.10 * quilt + 0.05 * fine_noise)
    height = height * inside
    gy, gx = np.gradient(height)
    strength = 2.8
    nx = -gx * strength
    ny = gy * strength   # OpenGL +Y (green up)
    nz = np.ones_like(nx)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal_img = np.zeros((res, res, 4), dtype=np.float32)
    normal_img[..., 0] = nx / ln * 0.5 + 0.5
    normal_img[..., 1] = ny / ln * 0.5 + 0.5
    normal_img[..., 2] = nz / ln * 0.5 + 0.5
    normal_img[..., 3] = 1.0

    # ---- roughness: matte membrane; veins are bare chitin = GLOSSIER (a spec
    #      line on a ridge is what sells "raised"); margins rough, spots smoother.
    rough = (0.44 - 0.06 * vein_mask + 0.26 * margin_amt
             - 0.06 * white_mask + 0.03 * scale_noise)
    rough = np.clip(rough, 0.30, 0.90)
    rough_img = np.zeros((res, res, 4), dtype=np.float32)
    rough_img[..., 0] = rough
    rough_img[..., 1] = rough
    rough_img[..., 2] = rough
    rough_img[..., 3] = 1.0

    return {"albedo": rgba, "normal": normal_img, "rough": rough_img}


def np_to_image(name, arr, colorspace):
    """Create/replace a Blender image from an (H,W,4) float32 array.

    We create an 8-bit image (float_buffer=False), whose pixel buffer is
    DISPLAY-referred (values in the image's own colorspace). So we write our
    values verbatim: albedo arrays already hold display sRGB, normal/roughness
    hold raw values. (Linearizing here would double-darken the albedo -> scarlet.)
    """
    h, w = arr.shape[:2]
    if name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[name])
    img = bpy.data.images.new(name, width=w, height=h, alpha=True,
                              float_buffer=False)
    img.colorspace_settings.name = colorspace

    buf = arr.astype(np.float32).copy()
    # Blender pixel buffer is bottom-row-first; our arrays are top-row-first.
    flipped = np.ascontiguousarray(buf[::-1, :, :])
    img.pixels.foreach_set(flipped.ravel())
    img.update()

    img.filepath_raw = os.path.join(TEX_DIR, name + ".png")
    img.file_format = "PNG"
    img.save()
    return img


# --------------------------------------------------------------------------- #
# Body parts
# --------------------------------------------------------------------------- #
def add_sphere(name, loc, scale, segs=24, rings=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=rings, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def build_body():
    """Returns (parts, dots): body geometry + the cream polka-dot spheres.
    Naming prefixes drive material assignment in main(): Eye* / Dot* / else."""
    parts = []
    dots = []

    # thorax: compact chunky furry ball (fuzz via low sheen + noise bump)
    thorax = add_sphere("Thorax", (0, 0.004, 0.0065), (0.0050, 0.0062, 0.0058))
    parts.append(thorax)

    # abdomen: short, stout, blunt-tipped (not a wasp stinger), trailing -Y
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.0035, radius2=0.0014,
                                    depth=0.014, location=(0, -0.010, 0.0045))
    abd = bpy.context.active_object
    abd.name = "Abdomen"
    abd.rotation_euler = (radians(92), 0, 0)
    bpy.ops.object.transform_apply(rotation=True)
    for p in abd.data.polygons:
        p.use_smooth = True
    parts.append(abd)

    # head
    head = add_sphere("Head", (0, 0.0165, 0.0062), (0.0036, 0.0036, 0.0034))
    parts.append(head)

    # compound eyes
    for sx in (-1, 1):
        eye = add_sphere("Eye_%d" % sx, (0.0027 * sx, 0.0172, 0.0062),
                         (0.0017, 0.0017, 0.0017), segs=16, rings=10)
        parts.append(eye)

    # antennae: thin shafts sweeping forward+up, each capped by a CLUB sphere
    for sx in (-1, 1):
        pts = []
        for t in np.linspace(0, 1, 9):
            x = sx * (0.0012 + 0.0052 * t)
            y = 0.0185 + 0.0125 * t
            z = 0.0075 + 0.0075 * t + 0.0035 * t * t
            pts.append((x, y, z))
        # shaft thickens toward the tip so the club isn't a lollipop on a wire
        ant = make_tube("Antenna_%d" % sx, pts, r0=0.0003, r1=0.0006)
        parts.append(ant)
        club = add_sphere("AntClub_%d" % sx, pts[-1], (0.0009, 0.0015, 0.0009),
                          segs=12, rings=8)
        parts.append(club)

    # legs ×6: thin, tucked back and down close to the thorax
    leg_roots = [(-0.0032, 0.010, 0.0035), (0.0032, 0.010, 0.0035),
                 (-0.0038, 0.004, 0.0030), (0.0038, 0.004, 0.0030),
                 (-0.0038, -0.001, 0.0030), (0.0038, -0.001, 0.0030)]
    for i, (rx, ry, rz) in enumerate(leg_roots):
        sx = -1 if rx < 0 else 1
        pts = [(rx, ry, rz),
               (rx + sx * 0.0026, ry - 0.0022, rz - 0.0035),
               (rx + sx * 0.0034, ry - 0.0052, rz - 0.0052)]
        leg = make_tube("Leg_%d" % i, pts, r0=0.00035, r1=0.00035)
        parts.append(leg)

    # proboscis: tight coil tucked under the head
    ppts = []
    for t in np.linspace(0, 1, 10):
        a = t * pi * 1.8
        y = 0.0185 - 0.0022 * t
        z = 0.0042 - 0.003 * t - 0.0016 * sin(a)
        x = 0.0007 * sin(a * 2)
        ppts.append((x, y, z))
    parts.append(make_tube("Proboscis", ppts, r0=0.0003, r1=0.0003))

    # --- cream polka dots: fine, dense white speckling of the monarch body ---
    def dot(name, loc, r=0.0006):
        d = add_sphere(name, loc, (r, r, r), segs=10, rings=8)
        dots.append(d)

    n = 0
    # thorax: side rows + a couple on top
    for yy in (0.008, 0.005, 0.002):
        for sx in (-1, 1):
            dot("Dot_%d" % n, (sx * 0.0046, yy, 0.006)); n += 1
    dot("Dot_%d" % n, (0, 0.007, 0.0115)); n += 1
    dot("Dot_%d" % n, (0, 0.003, 0.0118)); n += 1
    # head spots
    for sx in (-1, 1):
        dot("Dot_%d" % n, (sx * 0.0018, 0.0175, 0.0095), 0.0005); n += 1
    # abdomen: fine side rows down its (now shorter) length
    for k in range(6):
        yy = -0.004 - k * 0.0026
        rr = 0.00055 - k * 0.00007
        for sx in (-1, 1):
            dot("Dot_%d" % n, (sx * (0.0030 - k * 0.0004), yy, 0.004), rr); n += 1

    return parts, dots


def make_body_material(name, base_srgb, rough, sheen, fuzz=0.0):
    """Dark body material with optional high-freq bump for a furry read."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    lin = srgb_to_linear(np.array(base_srgb))
    bsdf.inputs["Base Color"].default_value = (float(lin[0]), float(lin[1]), float(lin[2]), 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    if "Sheen Weight" in bsdf.inputs:
        bsdf.inputs["Sheen Weight"].default_value = sheen
    if "Sheen Tint" in bsdf.inputs:
        bsdf.inputs["Sheen Tint"].default_value = (0.6, 0.45, 0.3, 1.0)  # warm, not white
    if fuzz > 0:
        tex = nt.nodes.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = 220.0
        tex.inputs["Detail"].default_value = 4.0
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = fuzz
        nt.links.new(tex.outputs["Fac"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return mat


def make_tube(name, points, r0, r1):
    """A tapered tube through a list of points via a bezier-ish poly + skin."""
    curve = bpy.data.curves.new(name + "_c", "CURVE")
    curve.dimensions = "3D"
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for i, (x, y, z) in enumerate(points):
        spline.points[i].co = (x, y, z, 1.0)
    curve.bevel_depth = r0
    curve.bevel_resolution = 3
    # taper via bevel factor mapping: use a taper object is heavy; approximate
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    return obj


# --------------------------------------------------------------------------- #
# Materials
# --------------------------------------------------------------------------- #
def make_wing_material(name, tex):
    alb = np_to_image(name + "_albedo", tex["albedo"], "sRGB")
    nrm = np_to_image(name + "_normal", tex["normal"], "Non-Color")
    rgh = np_to_image(name + "_rough", tex["rough"], "Non-Color")

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (-300, 0)
    out.location = (100, 0)

    n_alb = nt.nodes.new("ShaderNodeTexImage"); n_alb.image = alb; n_alb.location = (-900, 300)
    n_nrm = nt.nodes.new("ShaderNodeTexImage"); n_nrm.image = nrm; n_nrm.location = (-900, 0)
    n_rgh = nt.nodes.new("ShaderNodeTexImage"); n_rgh.image = rgh; n_rgh.location = (-900, -300)
    nmap = nt.nodes.new("ShaderNodeNormalMap"); nmap.location = (-600, 0)
    nmap.inputs["Strength"].default_value = 1.0

    nt.links.new(n_alb.outputs["Color"], bsdf.inputs["Base Color"])
    # Wings are opaque; the smooth mesh silhouette defines the shape, so we do
    # NOT drive Alpha (keeps material OPAQUE -> no transparency sorting in three).
    nt.links.new(n_rgh.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(n_nrm.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    # subtle sheen for that scaly iridescence read
    if "Sheen Weight" in bsdf.inputs:
        bsdf.inputs["Sheen Weight"].default_value = 0.25
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.5  # normal dielectric edge
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    mat.use_backface_culling = False
    return mat


def make_solid_material(name, base_srgb, rough=0.6, sheen=0.4):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    lin = srgb_to_linear(np.array(base_srgb))
    bsdf.inputs["Base Color"].default_value = (float(lin[0]), float(lin[1]), float(lin[2]), 1.0)
    bsdf.inputs["Roughness"].default_value = rough
    if "Sheen Weight" in bsdf.inputs:
        bsdf.inputs["Sheen Weight"].default_value = sheen
    return mat


def assign(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


# --------------------------------------------------------------------------- #
# Scene setup / cleanup
# --------------------------------------------------------------------------- #
def wipe_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images,
                 bpy.data.curves, bpy.data.armatures, bpy.data.actions):
        for item in list(coll):
            coll.remove(item)


def main():
    wipe_scene()

    # ----- wings -----
    fore_tex = make_wing_textures("fore", FOREWING_OUTLINE, forewing_veins())
    hind_tex = make_wing_textures("hind", HINDWING_OUTLINE, hindwing_veins())
    mat_fore = make_wing_material("WingFore", fore_tex)
    mat_hind = make_wing_material("WingHind", hind_tex)

    wing_FR = build_wing_mesh("Wing_FR", FOREWING_OUTLINE, FORE_SPAN, FORE_CHORD, y_shift=0.010)
    wing_HR = build_wing_mesh("Wing_HR", HINDWING_OUTLINE, HIND_SPAN, HIND_CHORD, y_shift=-0.008)
    assign(wing_FR, mat_fore)
    assign(wing_HR, mat_hind)
    # nudge wings out from body centerline
    wing_FR.location.x = 0.004
    wing_HR.location.x = 0.003

    # left wings mirror across X=0
    def mirror(obj, newname):
        m = obj.copy()
        m.data = obj.data.copy()
        m.name = newname
        bpy.context.collection.objects.link(m)
        m.scale.x = -1
        return m
    wing_FL = mirror(wing_FR, "Wing_FL")
    wing_HL = mirror(wing_HR, "Wing_HL")

    wings = [wing_FR, wing_HR, wing_FL, wing_HL]

    # ----- body -----
    body_parts, dots = build_body()
    mat_body = make_body_material("Body", (0.055, 0.040, 0.030), rough=0.82, sheen=0.2, fuzz=0.28)
    mat_eye = make_body_material("Eye", (0.020, 0.018, 0.022), rough=0.32, sheen=0.0)
    mat_dot = make_body_material("Dot", (0.905, 0.880, 0.815), rough=0.6, sheen=0.0)
    for p in body_parts:
        if not hasattr(p.data, "materials"):
            continue
        p.data.materials.clear()
        p.data.materials.append(mat_eye if p.name.startswith("Eye") else mat_body)
    for d in dots:
        d.data.materials.clear()
        d.data.materials.append(mat_dot)

    # ----- armature -----
    arm = build_armature()
    # skin wings each 100% to their bone; body to thorax bone
    skin_rigid(wing_FR, arm, "wing_FR")
    skin_rigid(wing_HR, arm, "wing_HR")
    skin_rigid(wing_FL, arm, "wing_FL")
    skin_rigid(wing_HL, arm, "wing_HL")
    for p in body_parts + dots:
        # curves need converting to mesh to skin; convert
        conv = convert_to_mesh(p)
        skin_rigid(conv, arm, "thorax")

    # ----- animations -----
    make_animations(arm)

    # Export BEFORE adding render-only lights/camera/ground so the GLB is clean.
    if DO_EXPORT:
        export_glb()

    if DO_RENDER:
        setup_render_scene()
        render_hero()


# --------------------------------------------------------------------------- #
# Armature + skinning
# --------------------------------------------------------------------------- #
def build_armature():
    bpy.ops.object.armature_add(location=(0, 0, 0))
    arm = bpy.context.active_object
    arm.name = "Monarch_Rig"
    amt = arm.data
    bpy.ops.object.mode_set(mode="EDIT")
    ebones = amt.edit_bones
    # remove default
    for b in list(ebones):
        ebones.remove(b)

    def bone(name, head, tail, parent=None):
        b = ebones.new(name)
        b.head = head
        b.tail = tail
        if parent:
            b.parent = parent
            b.use_connect = False
        return b

    thorax = bone("thorax", (0, 0, 0.005), (0, 0.006, 0.006))
    wfr = bone("wing_FR", (0.004, 0.008, 0.006), (0.03, 0.02, 0.008), thorax)
    whr = bone("wing_HR", (0.003, -0.004, 0.005), (0.025, -0.01, 0.006), thorax)
    wfl = bone("wing_FL", (-0.004, 0.008, 0.006), (-0.03, 0.02, 0.008), thorax)
    whl = bone("wing_HL", (-0.003, -0.004, 0.005), (-0.025, -0.01, 0.006), thorax)
    bpy.ops.object.mode_set(mode="OBJECT")
    return arm


def skin_rigid(obj, arm, bone_name):
    # add vertex group with all verts weight 1
    vg = obj.vertex_groups.new(name=bone_name)
    idx = [v.index for v in obj.data.vertices]
    vg.add(idx, 1.0, "REPLACE")
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    obj.parent = arm


def convert_to_mesh(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    if obj.type == "CURVE":
        bpy.ops.object.convert(target="MESH")
    return bpy.context.active_object


# --------------------------------------------------------------------------- #
# Animations: Flap (flight), Glide (rest)
# --------------------------------------------------------------------------- #
def _key_wing_rotation(arm, frame, up_deg, twist_deg=0.0):
    """Pose all 4 wing bones to a flap angle at a frame. Rotation about the
    body's fore/aft (Y) axis raises/lowers the wing; small twist about X."""
    bpy.context.scene.frame_set(frame)
    pb = arm.pose.bones
    mapping = {
        "wing_FR": (+1, +1), "wing_HR": (+1, +1),
        "wing_FL": (-1, -1), "wing_HL": (-1, -1),
    }
    for name, (side, tside) in mapping.items():
        b = pb[name]
        b.rotation_mode = "XYZ"
        # raise about Y (roll), twist about X (pitch) for figure-8
        b.rotation_euler = Euler((radians(twist_deg * tside),
                                  radians(up_deg * side), 0.0), "XYZ")
        b.keyframe_insert("rotation_euler", frame=frame)


def make_animations(arm):
    scene = bpy.context.scene
    scene.render.fps = 60
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")

    # --- Flap action: fast down, slower up, figure-8 twist ---
    flap = bpy.data.actions.new("Flap")
    arm.animation_data_create()
    arm.animation_data.action = flap
    # one wingbeat ~ 10 frames @60fps (~6 Hz). Slow recovery up, fast power down.
    _key_wing_rotation(arm, 1, up_deg=-20, twist_deg=-8)   # low (open below)
    _key_wing_rotation(arm, 7, up_deg=+60, twist_deg=+12)  # top (nearly meet)
    _key_wing_rotation(arm, 10, up_deg=-20, twist_deg=-8)  # fast power downstroke
    flap.use_fake_user = True

    # --- Glide action: wings held up slightly, gentle bob ---
    arm.animation_data.action = None
    glide = bpy.data.actions.new("Glide")
    arm.animation_data.action = glide
    _key_wing_rotation(arm, 1, up_deg=22, twist_deg=2)
    _key_wing_rotation(arm, 30, up_deg=30, twist_deg=4)
    _key_wing_rotation(arm, 60, up_deg=22, twist_deg=2)
    glide.use_fake_user = True

    bpy.ops.object.mode_set(mode="OBJECT")
    # leave Flap as active for export default
    arm.animation_data.action = flap
    scene.frame_start = 1
    scene.frame_end = 10


# --------------------------------------------------------------------------- #
# Render (look-dev)
# --------------------------------------------------------------------------- #
def setup_render_scene():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 800
    scene.render.film_transparent = False
    scene.eevee.taa_render_samples = 128
    # Standard view transform for faithful colors during look-dev
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"

    # pose wings near the top of the upstroke for a classic hero silhouette
    scene.frame_set(6)

    # world: soft gradient sky (Sun lamps below are scale-independent)
    world = bpy.data.worlds.new("W")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (0.10, 0.13, 0.20, 1)
    bg.inputs[1].default_value = 0.5

    # camera: 3/4 top-down looking at the butterfly
    cam_data = bpy.data.cameras.new("Cam")
    cam = bpy.data.objects.new("Cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = (0.072, -0.072, 0.108)
    cam.rotation_euler = (radians(46), 0, radians(46))
    cam_data.lens = 58
    scene.camera = cam

    def sun(name, strength, rot, color=(1, 1, 1)):
        li = bpy.data.lights.new(name, "SUN")
        li.energy = strength
        li.angle = radians(3)
        li.color = color
        o = bpy.data.objects.new(name, li)
        scene.collection.objects.link(o)
        o.rotation_euler = tuple(radians(a) for a in rot)
        return o

    sun("Key", 4.5, (48, 8, 40), color=(1.0, 0.97, 0.92))
    sun("Rim", 3.0, (60, 0, -140), color=(0.85, 0.9, 1.0))   # cool backlight
    sun("Fill", 1.2, (30, 0, 200), color=(0.9, 0.92, 1.0))

    # ground plane (soft, catches a shadow)
    bpy.ops.mesh.primitive_plane_add(size=1.0, location=(0, 0, -0.02))
    ground = bpy.context.active_object
    gm = make_solid_material("Ground", (0.10, 0.12, 0.11), rough=0.95, sheen=0.0)
    assign(ground, gm)


def render_hero():
    scene = bpy.context.scene
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = os.path.join(REND_DIR, "hero.png")
    bpy.ops.render.render(write_still=True)
    print("RENDERED", scene.render.filepath)


# --------------------------------------------------------------------------- #
# Export
# --------------------------------------------------------------------------- #
def export_glb():
    # select all mesh + armature
    bpy.ops.object.select_all(action="SELECT")
    path = os.path.join(MODEL_DIR, "monarch.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_nla_strips=False,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )
    print("EXPORTED", path, os.path.getsize(path), "bytes")


if __name__ == "__main__":
    main()
