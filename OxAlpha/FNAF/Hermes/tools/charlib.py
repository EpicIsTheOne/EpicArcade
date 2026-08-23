# charlib.py — shared helpers for building Wonderdrome animatronics headlessly.
# Runs INSIDE Blender's Python. All coordinates: Z-up, floor at z=0.
import bpy, math, os
from mathutils import Vector

TAU = math.tau

def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def _link(obj):
    # ops-created meshes are already linked; only link data-API objects
    if not bpy.context.collection.objects.get(obj.name):
        bpy.context.collection.objects.link(obj)
    return obj

def new_empty(name, loc=(0,0,0), parent=None):
    e = bpy.data.objects.new(name, None)
    e.location = loc
    if parent: e.parent = parent
    return _link(e)

# ---------------- materials ----------------
def mat(name, color, metallic=0.0, roughness=0.6, emit=None, emit_str=0.0):
    m = bpy.data.materials.get(name)
    if m: return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    def lin(c):
        # authored as sRGB intent -> Blender wants linear
        return tuple(v**2.2 for v in c)
    def setin(k, v):
        if k in bsdf.inputs: bsdf.inputs[k].default_value = v
    setin("Base Color", (*lin(color), 1.0))
    setin("Metallic", metallic)
    setin("Roughness", roughness)
    if emit is not None and emit_str > 0:
        e = lin(emit)
        ok = False
        for k in ("Emission Color", "Emission"):
            if k in bsdf.inputs:
                bsdf.inputs[k].default_value = (*e, 1.0)
                ok = True; break
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emit_str
        if not ok:
            setin("Emission", (*e, 1.0))
    return m

def assign(obj, m):
    obj.data.materials.clear()
    obj.data.materials.append(m)

# ---------------- primitives ----------------
def _finish(obj, name, parent, loc, rot, m):
    obj.name = name
    obj.location = loc
    obj.rotation_euler = rot
    if parent: obj.parent = parent
    _link(obj)
    if m: assign(obj, m)
    return obj

def add_box(parent, name, size, loc, rot=(0,0,0), m=None):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object
    o.scale = (size[0], size[1], size[2])
    _bake(o)
    return _finish(o, name, parent, loc, rot, m)

def add_sph(parent, name, r, loc, scale=(1,1,1), rot=(0,0,0), segs=(20,14), m=None):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=segs[0], ring_count=segs[1])
    o = bpy.context.active_object
    o.scale = scale
    _bake(o)
    bpy.ops.object.shade_smooth()
    return _finish(o, name, parent, loc, rot, m)

def add_cyl(parent, name, r, depth, loc, rot=(0,0,0), verts=16, m=None, cap=True):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=verts)
    o = bpy.context.active_object
    return _finish(o, name, parent, loc, rot, m)

def add_cone(parent, name, r, depth, loc, rot=(0,0,0), verts=14, m=None):
    bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=0.0, depth=depth, vertices=verts)
    o = bpy.context.active_object
    return _finish(o, name, parent, loc, rot, m)

def add_torus(parent, name, R, r, loc, rot=(0,0,0), mj=24, mn=10, arc=None, m=None):
    kw = dict(major_radius=R, minor_radius=r, major_segments=mj, minor_segments=mn,
              abso_major_rad=0, abso_minor_rad=0)
    if arc: kw["major_arc"] = arc   # radians, available 3.x+
    bpy.ops.mesh.primitive_torus_add(**kw)
    o = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    return _finish(o, name, parent, loc, rot, m)

def _bake(o):
    # apply object scale into mesh so normals/shading stay clean
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.select_set(False)

def join_children(pivot):
    """Join all direct mesh children of an empty into one mesh (keeps pivot)."""
    kids = [c for c in pivot.children if c.type == 'MESH']
    if len(kids) < 2: return
    bpy.ops.object.select_all(action='DESELECT')
    for k in kids: k.select_set(True)
    bpy.context.view_layer.objects.active = kids[-1]
    bpy.ops.object.join()
    bpy.ops.object.select_all(action='DESELECT')

# ---------------- export / render ----------------
def select_subtree(root):
    bpy.ops.object.select_all(action='DESELECT')
    stack = [root]
    while stack:
        n = stack.pop()
        n.select_set(True)
        stack.extend(n.children)
    bpy.context.view_layer.objects.active = root

def export_glb(root, path):
    select_subtree(root)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=True,
        export_yup=True, export_apply=False, export_animations=False,
        export_cameras=False, export_lights=False)
    bpy.ops.object.select_all(action='DESELECT')

def setup_render(engine_hint='auto', res=(800, 1000), samples=24):
    sc = bpy.context.scene
    eng = None
    candidates = ['BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES']
    if engine_hint != 'auto': candidates = [engine_hint] + candidates
    for c in candidates:
        try:
            sc.render.engine = c; eng = c; break
        except Exception: continue
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = False
    if hasattr(sc, "eevee"):
        try: sc.eevee.taa_render_samples = samples
        except Exception: pass
    w = bpy.data.worlds.get("Wd") or bpy.data.worlds.new("Wd")
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get("Background")
    if bg: bg.inputs[0].default_value = (0.010, 0.012, 0.02, 1.0)
    return eng

def add_render_rig(center=(0,0,0), dist=4.8, height=1.7, yaw_deg=35):
    """Three-point lights + camera AUTO-FRAMED on the scene's actual mesh bounds."""
    import mathutils
    mn=[1e9]*3; mx=[-1e9]*3
    for ob in bpy.data.objects:
        if ob.type!='MESH': continue
        for corner in ob.bound_box:
            wc=ob.matrix_world @ mathutils.Vector(corner)
            for i in range(3):
                mn[i]=min(mn[i],wc[i]); mx[i]=max(mx[i],wc[i])
    ctr=Vector(((mn[0]+mx[0])/2,(mn[1]+mx[1])/2,(mn[2]+mx[2])/2))
    radius=max((mx[0]-mn[0])/2,(mx[1]-mn[1])/2,(mx[2]-mn[2])/2, 0.8)
    fov_v=math.radians(39.6)                      # 50mm lens, 36mm sensor
    d=max(radius/math.tan(fov_v/2)*1.22, 3.2)
    cy, sy = math.cos(math.radians(yaw_deg)), math.sin(math.radians(yaw_deg))
    cam_loc=(ctr.x+d*sy, ctr.y-d*cy, ctr.z)
    cd=bpy.data.cameras.new("Cam"); cd.lens=50
    cam=_link(bpy.data.objects.new("Cam", cd))
    cam.location=cam_loc
    dvec=ctr-Vector(cam_loc)
    cam.rotation_euler=dvec.to_track_quat('-Z','Y').to_euler()
    bpy.context.scene.camera=cam
    def lamp(name, kind, loc, energy, color=(1,1,1), size=1.4):
        ld=bpy.data.lights.new(name, kind)
        ld.energy=energy*max(1.0,d/4.0); ld.color=tuple(v**2.2 for v in color)
        if kind=='AREA': ld.size=size
        lo=_link(bpy.data.objects.new(name, ld))
        lo.location=loc
        dirv=ctr-Vector(loc)
        lo.rotation_euler=dirv.to_track_quat('-Z','Y').to_euler()
        return lo
    lamp("Key",  'AREA', (ctr.x+ d*0.55*sy+1.2, ctr.y-2.4, ctr.z+1.6), 1500, (1.0,0.96,0.9))
    lamp("Fill", 'AREA', (ctr.x-2.8, ctr.y-1.5, ctr.z-0.4), 430, (0.55,0.65,1.0))
    lamp("Rim",  'AREA', (ctr.x-1.0, ctr.y+ d*0.62, ctr.z+1.0), 850, (0.8,0.9,1.0))
    return cam
