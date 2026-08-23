# build_characters.py — builds all five Wonderdrome animatronics headlessly.
# Run: blender -b -P tools/build_characters.py -- --out assets/characters --renders screenshots/blender
import sys, os, math
argv = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
OUT = os.path.abspath(argv[0] if len(argv) > 0 else "assets/characters")
REN = os.path.abspath(argv[1] if len(argv) > 1 else "screenshots/blender")
os.makedirs(OUT, exist_ok=True); os.makedirs(REN, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from charlib import *
import charlib

PI = math.pi

def joint(name, loc=(0,0,0), parent=None):
    return new_empty(name, loc=loc, parent=parent)

def meshpart(parent, kind, name, *args, **kw):
    m = kw.pop("m", None)
    rot = kw.pop("rot", (0,0,0))
    if kind == "box":   o = add_box(parent, name, args[0], args[1], rot=rot, m=m)
    elif kind == "sph": o = add_sph(parent, name, args[0], args[1], scale=args[2], rot=rot, m=m)
    elif kind == "cyl": o = add_cyl(parent, name, args[0], args[1], args[2], rot=rot, m=m)
    elif kind == "cone":o = add_cone(parent, name, args[0], args[1], args[2], rot=rot, m=m)
    elif kind == "torus": o = add_torus(parent, name, args[0], args[1], args[2], rot=rot, m=m)
    else: raise ValueError(kind)
    # loc args are LOCAL offsets relative to parent — standard parenting is enough
    return o

def limb_chain(hip, lengths, rads, mats, axis="y", bend_dir=-1):
    """Build a chain of segments hanging downward; returns list of joints."""
    joints = [hip]
    par = hip
    z = 0.0
    for i, L in enumerate(lengths):
        j = new_empty(f"{hip.name}.s{i+1}", loc=(0, 0, -L if axis=="y" else 0), parent=par)
        seg = f"{hip.name}_seg{i}"
        rr = rads[i]
        cyl = add_cyl(par, seg, rr, L, (0, 0, -L/2 if axis=="y" else (L/2,0,0)),
                      rot=(0, PI/2, 0) if axis=="x" else (0,0,0), verts=12, m=mats[i % len(mats)])
        joints.append(j); par = j
    return joints

# ============================================================ ORV
def build_orv():
    reset_scene()
    M = {
      "fur":   mat("Orv_Fur",   (0.135, 0.085, 0.052), roughness=0.82),
      "muzzle":mat("Orv_Muzzle",(0.62, 0.50, 0.36),  roughness=0.75),
      "inner": mat("Orv_Inner", (0.45, 0.16, 0.10),  roughness=0.7),
      "metal": mat("Orv_Joint", (0.32, 0.33, 0.38), metallic=0.9, roughness=0.35),
      "eyeY":  mat("Eye_Yolk",  (0.93, 0.88, 0.70), roughness=0.25),
      "eyeB":  mat("Eye_Black", (0.01, 0.01, 0.012), roughness=0.15),
      "hat":   mat("Orv_Hat",   (0.09, 0.07, 0.06), roughness=0.5),
      "bow":   mat("Orv_Bow",   (0.55, 0.10, 0.12), roughness=0.6),
      "teeth": mat("Teeth",     (0.92, 0.90, 0.82), roughness=0.4),
      "glow":  mat("Orv_Glow",  (0.02,0.02,0.02), emit=(1.0, 0.42, 0.10), emit_str=4.0),
    }
    root = joint("Orv_Root", (0, 0, 0))
    hips = joint("Orv_Hips", (0, 0, 1.30), root)

    # torso
    torso = meshpart(hips, "sph", "Orv_Torso", 0.52, (0, 0, 0.18), (1.0, 0.78, 1.22), m=M["fur"])
    belly = meshpart(hips, "sph", "Orv_Belly", 0.40, (0, -0.24, 0.14), (0.85, 0.62, 1.05), m=M["muzzle"])
    # bow tie
    for s in (-1, 1):
        meshpart(hips, "box", f"Orv_Bow{s}", (0.16, 0.05, 0.11), (s*0.10, -0.40, 0.44),
                 rot=(0, s*0.35, 0), m=M["bow"])
    meshpart(hips, "sph", "Orv_BowKnot", 0.035, (0, -0.42, 0.44), (1,1,1), m=M["bow"])

    # head group
    head = joint("Orv_Head", (0, 0, 0.72), hips)
    skull = meshpart(head, "sph", "Orv_Skull", 0.34, (0, 0, 0.16), (1.0, 0.95, 0.98), m=M["fur"])
    muzzle = meshpart(head, "sph", "Orv_Snout", 0.17, (0, -0.26, 0.08), (1.15, 0.9, 0.8), m=M["muzzle"])
    nose = meshpart(head, "sph", "Orv_Nose", 0.055, (0, -0.42, 0.12), (1,1,1), m=M["eyeB"])
    # jaw (hinged) with teeth
    jaw = joint("Orv_Jaw", (0, -0.06, 0.04), head)
    meshpart(jaw, "sph", "Orv_JawMass", 0.13, (0, -0.16, -0.03), (1.1, 1.0, 0.55), m=M["muzzle"])
    for i in range(5):
        x = -0.09 + i*0.045
        meshpart(jaw, "box", f"Orv_ToothU{i}", (0.028, 0.03, 0.06), (x, -0.27, 0.055), m=M["teeth"])
        meshpart(head, "box", f"Orv_ToothL{i}", (0.028, 0.03, 0.06), (x, -0.285, -0.005), m=M["teeth"])
    # eyes — glowing irises in dark sockets
    for s in (-1, 1):
        sock = meshpart(head, "sph", f"Orv_EyeSock{s}", 0.105, (s*0.145, -0.20, 0.235), (1.05, 1.05, 1.05), m=M["eyeB"])
        meshpart(head, "sph", f"Orv_Eye{s}", 0.062, (s*0.145, -0.255, 0.235), (1,1,1), m=M["eyeY"])
        meshpart(head, "sph", f"Orv_Pupil{s}", 0.033, (s*0.145, -0.305, 0.237), (1,1,1), m=M["glow"])
    # brows — heavy plates, angry tilt
    for s in (-1, 1):
        meshpart(head, "box", f"Orv_Brow{s}", (0.15, 0.06, 0.045), (s*0.15, -0.245, 0.335),
                 rot=(0, 0, s*0.28), m=M["fur"])
    # ears + top hat
    for s in (-1, 1):
        e = joint(f"Orv_Ear{s}", (s*0.26, 0.0, 0.42), head)
        meshpart(e, "cyl", f"Orv_EarC{s}", 0.075, 0.05, (0, 0, 0), rot=(PI/2, 0, 0), verts=12, m=M["inner"])
        meshpart(e, "torus", f"Orv_EarRim{s}", 0.075, 0.02, (0, 0, 0), rot=(PI/2, 0, 0), mj=18, mn=8, m=M["fur"])
    meshpart(head, "cyl", "Orv_HatBrim", 0.21, 0.02, (0.02, 0.02, 0.47), verts=20, m=M["hat"])
    meshpart(head, "cyl", "Orv_HatTop", 0.145, 0.22, (0.02, 0.02, 0.59), verts=20, m=M["hat"])
    meshpart(head, "cyl", "Orv_HatBand", 0.148, 0.045, (0.02, 0.02, 0.505), verts=20, m=M["bow"])

    # arms — shoulder/elbow/wrist joints (all aligned on x = s*0.05 from shoulder)
    for s in (-1, 1):
        sh = joint(f"Orv_Shoulder{s}", (s*0.48, 0, 0.42), hips)
        meshpart(sh, "sph", f"Orv_ShoulderBall{s}", 0.11, (0,0,0), (1,1,1), m=M["metal"])
        meshpart(sh, "cyl", f"Orv_UpperSeg{s}", 0.075, 0.34, (0, 0, -0.19), verts=10, m=M["fur"])
        el = joint(f"Orv_Elbow{s}", (0, 0, -0.40), sh)
        meshpart(el, "sph", f"Orv_ElbowBall{s}", 0.075, (0,0,0), (1,1,1), m=M["metal"])
        meshpart(sh, "cyl", f"Orv_ForeSeg{s}", 0.062, 0.32, (0, 0, -0.56), verts=10, m=M["fur"])
        wr = joint(f"Orv_Wrist{s}", (0, 0, -0.34), el)   # -0.74 in shoulder space
        meshpart(wr, "sph", f"Orv_Hand{s}", 0.10, (0, 0, -0.05), (1.0, 0.85, 1.1), m=M["fur"])

    # legs (knee at -0.54 in hip space; ankle at -1.08 => -0.54 in knee space)
    for s in (-1, 1):
        hp = joint(f"Orv_Hip{s}", (s*0.22, 0, -0.18), hips)
        meshpart(hp, "sph", f"Orv_HipBall{s}", 0.10, (0,0,0), (1,1,1), m=M["metal"])
        meshpart(hp, "cyl", f"Orv_Thigh{s}", 0.085, 0.52, (0, 0, -0.26), verts=10, m=M["fur"])
        kn = joint(f"Orv_Knee{s}", (0, 0, -0.54), hp)
        meshpart(kn, "sph", f"Orv_KneeBall{s}", 0.08, (0,0,0), (1,1,1), m=M["metal"])
        meshpart(hp, "cyl", f"Orv_Shin{s}", 0.07, 0.52, (0, 0, -0.80), verts=10, m=M["fur"])
        ft = joint(f"Orv_Ankle{s}", (0, 0, -0.54), kn)
        meshpart(ft, "box", f"Orv_Foot{s}", (0.20, 0.34, 0.10), (0, -0.08, -0.05), m=M["fur"])

    join_children(root)
    export_glb(root, os.path.join(OUT, "orv.glb"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "orv.blend"))
    setup_render(res=(720, 900))
    add_render_rig(center=(0,0,1.0), dist=3.2, height=1.5, yaw_deg=30)
    bpy.context.scene.render.filepath = os.path.join(REN, "orv_front.png"); bpy.ops.render.render(write_still=True)
    print("ORV OK")
    return root

# ============================================================ RIVETS
def build_rivets():
    reset_scene()
    M = {
      "plate": mat("Riv_Plate", (0.155, 0.185, 0.205), metallic=0.75, roughness=0.45),
      "dark":  mat("Riv_Dark",  (0.055, 0.06, 0.07), metallic=0.6, roughness=0.55),
      "rust":  mat("Riv_Rust",  (0.36, 0.17, 0.08), metallic=0.3, roughness=0.85),
      "hazard":mat("Riv_Hazard",(0.85, 0.62, 0.05), roughness=0.6),
      "visor": mat("Riv_Visor", (0.02, 0.02, 0.025), emit=(0.05, 0.9, 0.35), emit_str=3.0),
      "lamp":  mat("Riv_Lamp",  (0.02, 0.02, 0.02), emit=(1.0, 0.15, 0.05), emit_str=5.0),
      "teeth": mat("Teeth",     (0.9, 0.88, 0.8), roughness=0.4),
      "grind": mat("Riv_Grind", (0.75, 0.76, 0.8), metallic=0.95, roughness=0.25),
    }
    root = joint("Riv_Root", (0, 0, 0))
    hips = joint("Riv_Hips", (0, 0, 1.42), root)

    # segmented industrial torso
    meshpart(hips, "box", "Riv_Chest", (0.62, 0.40, 0.56), (0, 0, 0.28), m=M["plate"])
    meshpart(hips, "box", "Riv_Belly", (0.50, 0.34, 0.34), (0, 0.01, -0.10), m=M["dark"])
    meshpart(hips, "box", "Riv_HazardStrip", (0.64, 0.42, 0.07), (0, 0, 0.02), m=M["hazard"])
    for i, x in enumerate((-0.18, -0.06, 0.06, 0.18)):
        meshpart(hips, "cyl", f"Riv_BellyVent{i}", 0.035, 0.36, (x, -0.19, -0.10), rot=(PI/2, 0, 0), verts=10, m=M["dark"])
    # spine stack visible between chest and pelvis
    for i in range(3):
        meshpart(hips, "cyl", f"Riv_Spine{i}", 0.06, 0.06, (0, 0, -0.32 - i*0.0), rot=(0,0,0), verts=10, m=M["rust"]) \
        if False else None
    pelvis = joint("Riv_Pelvis", (0, 0, -0.30), hips)
    meshpart(pelvis, "box", "Riv_PelvisPlate", (0.46, 0.32, 0.22), (0, 0, 0), m=M["plate"])

    # head — boxy helmet, single wide visor slit glowing green
    head = joint("Riv_Head", (0, 0, 0.66), hips)
    meshpart(head, "box", "Riv_Skull", (0.40, 0.38, 0.34), (0, 0, 0.10), m=M["plate"])
    meshpart(head, "box", "Riv_VisorFrame", (0.42, 0.06, 0.14), (0, -0.185, 0.10), m=M["dark"])
    meshpart(head, "box", "Riv_Visor", (0.34, 0.02, 0.08), (0, -0.215, 0.10), m=M["visor"])
    # welding mask brow ridge
    meshpart(head, "box", "Riv_Brow", (0.43, 0.30, 0.08), (0, -0.03, 0.30), m=M["dark"])
    # rivet dots along helmet seams
    ri = 0
    for zz in (0.24, 0.10, -0.03):
        for xx in (-0.17, 0.0, 0.17):
            meshpart(head, "sph", f"Riv_Dot{ri}", 0.018, (xx, -0.195, zz), (1,1,1), m=M["rust"]); ri += 1
    # side lamps (one broken/dark)
    meshpart(head, "cyl", "Riv_LampL", 0.05, 0.05, (-0.215, -0.10, 0.16), rot=(PI/2, 0, 0), verts=12, m=M["lamp"])
    meshpart(head, "cyl", "Riv_LampR", 0.05, 0.05, (0.215, -0.10, 0.16), rot=(PI/2, 0, 0), verts=12, m=M["dark"])
    # antenna
    meshpart(head, "cyl", "Riv_Antenna", 0.012, 0.30, (0.14, 0.10, 0.38), verts=8, m=M["dark"])
    meshpart(head, "sph", "Riv_AntTip", 0.028, (0.14, 0.10, 0.53), (1,1,1), m=M["lamp"])
    # grinding jaw — exposed teeth row on a metal mandible
    jaw = joint("Riv_Jaw", (0, -0.10, -0.06), head)
    meshpart(jaw, "box", "Riv_Mandible", (0.34, 0.26, 0.10), (0, -0.06, -0.02), m=M["dark"])
    meshpart(jaw, "box", "Riv_TeethRow", (0.30, 0.05, 0.06), (0, -0.14, 0.045), m=M["teeth"])
    meshpart(head, "box", "Riv_TeethTop", (0.30, 0.05, 0.06), (0, -0.16, 0.015), m=M["teeth"])
    # circular saw arm (right) / claw drill (left) — joints aligned with cylinders
    sawhub = joint("Riv_SawHub", (0.42, 0, 0.30), hips)
    meshpart(sawhub, "cyl", "Riv_ArmUpper", 0.065, 0.40, (0, 0, -0.20), verts=10, m=M["plate"])
    elbowr = joint("Riv_SawElbow", (0, 0, -0.40), sawhub)
    meshpart(sawhub, "cyl", "Riv_ArmFore", 0.055, 0.36, (0, 0, -0.58), verts=10, m=M["plate"])
    wristr = joint("Riv_SawWrist", (0, 0, -0.78), elbowr)
    disc = meshpart(wristr, "cyl", "Riv_SawDisc", 0.26, 0.025, (0, -0.02, -0.10), rot=(PI/2, 0, 0), verts=24, m=M["grind"])
    for t_i in range(8):  # teeth around the disc
        a = t_i / 8 * TAU
        meshpart(wristr, "box", f"Riv_SawTooth{t_i}", (0.05, 0.03, 0.06),
                 (math.sin(a)*0.27, -0.02, -0.10 + math.cos(a)*0.27), rot=(a, 0, 0), m=M["grind"])
    hubcap = meshpart(wristr, "cyl", "Riv_SawHubCap", 0.05, 0.05, (0, -0.02, -0.10), rot=(PI/2, 0, 0), verts=12, m=M["rust"])

    shl = joint("Riv_ClawHub", (-0.42, 0, 0.30), hips)
    meshpart(shl, "cyl", "Riv_ClawUpper", 0.065, 0.38, (0, 0, -0.19), verts=10, m=M["plate"])
    elbowl = joint("Riv_ClawElbow", (0, 0, -0.38), shl)
    meshpart(shl, "cyl", "Riv_ClawFore", 0.055, 0.34, (0, 0, -0.55), verts=10, m=M["plate"])
    wristl = joint("Riv_ClawWrist", (0, 0, -0.34), elbowl)   # -0.72 in hub space
    meshpart(wristl, "cyl", "Riv_DrillBody", 0.07, 0.16, (0, 0, -0.10), verts=12, m=M["dark"])
    dr = meshpart(wristl, "cone", "Riv_DrillBit", 0.075, 0.26, (0, 0, -0.31), rot=(PI, 0, 0), verts=12, m=M["grind"])

    # legs — piston style (knee at -0.52 in hip space; ankle -1.00 => -0.48 in knee space)
    for s in (-1, 1):
        hp = joint(f"Riv_Hip{s}", (s*0.24, 0, -0.42), hips)
        meshpart(hp, "cyl", f"Riv_ThighPiston{s}", 0.085, 0.50, (0, 0, -0.25), verts=10, m=M["plate"])
        meshpart(hp, "cyl", f"Riv_ThighRod{s}", 0.045, 0.58, (0, 0, -0.29), verts=8, m=M["grind"])
        kn = joint(f"Riv_Knee{s}", (0, 0, -0.52), hp)
        meshpart(kn, "sph", f"Riv_KneeBall{s}", 0.095, (0,0,0), (1,1,1), m=M["rust"])
        meshpart(hp, "cyl", f"Riv_Shin{s}", 0.075, 0.48, (0, 0, -0.76), verts=10, m=M["plate"])
        ft = joint(f"Riv_Ankle{s}", (0, 0, -0.48), kn)
        meshpart(ft, "box", f"Riv_Foot{s}", (0.24, 0.38, 0.10), (0, -0.07, -0.05), m=M["dark"])

    join_children(root)
    export_glb(root, os.path.join(OUT, "rivets.glb"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "rivets.blend"))
    setup_render(res=(720, 900))
    add_render_rig(center=(0,0,1.0), dist=3.2, height=1.5, yaw_deg=30)
    bpy.context.scene.render.filepath = os.path.join(REN, "rivets_front.png"); bpy.ops.render.render(write_still=True)
    print("RIVETS OK")
    return root

# ============================================================ SERA
def build_sera():
    reset_scene()
    M = {
      "shell": mat("Sera_Shell", (0.88, 0.86, 0.84), roughness=0.3),
      "gold":  mat("Sera_Gold",  (0.85, 0.65, 0.20), metallic=0.95, roughness=0.28),
      "rose":  mat("Sera_Rose",  (0.75, 0.30, 0.38), roughness=0.5),
      "dark":  mat("Sera_Dark",  (0.10, 0.09, 0.10), metallic=0.7, roughness=0.4),
      "glass": mat("Sera_Glass", (0.02, 0.02, 0.02), emit=(0.9, 0.75, 0.85), emit_str=2.5),
      "crack": mat("Sera_Crack", (0.05, 0.05, 0.05), roughness=0.8),
      "teeth": mat("Teeth",      (0.9, 0.88, 0.8), roughness=0.4),
    }
    root = joint("Sera_Root", (0, 0, 0))
    hips = joint("Sera_Hips", (0, 0, 1.46), root)
    # torso — porcelain ballerina torso
    meshpart(hips, "sph", "Sera_Torso", 0.30, (0, 0, 0.22), (0.85, 0.72, 1.15), m=M["shell"])
    meshpart(hips, "sph", "Sera_Chest", 0.24, (0, -0.02, 0.42), (0.92, 0.8, 0.9), m=M["shell"])
    # corset
    meshpart(hips, "cyl", "Sera_Corset", 0.26, 0.30, (0, 0, 0.10), verts=16, m=M["rose"])
    # tutu — ring of petals
    for i in range(10):
        a = i / 10 * TAU
        meshpart(hips, "cone", f"Sera_Petal{i}", 0.10, 0.16,
                 (math.sin(a)*0.30, math.cos(a)*0.30, -0.02),
                 rot=(math.cos(a)*1.35, -math.sin(a)*1.35, 0), verts=6, m=M["rose"])
    # ballerina joints — gold ball fittings
    head = joint("Sera_Head", (0, 0, 0.62), hips)
    meshpart(hips, "sph", "Sera_NeckBall", 0.07, (0, 0, 0.56), (1,1,1), m=M["gold"])
    # head — egg with cracked cheek
    meshpart(head, "sph", "Sera_Skull", 0.24, (0, 0, 0.16), (0.92, 1.0, 1.12), m=M["shell"])
    # hair bun + crown
    meshpart(head, "sph", "Sera_Bun", 0.11, (0, 0.10, 0.40), (1,1,1), m=M["dark"])
    for i in range(5):
        a = (i/5 - 0.5) * 1.8
        meshpart(head, "cone", f"Sera_CrownPt{i}", 0.02, 0.09,
                 (math.sin(a)*0.14, 0.02, 0.38), rot=(-0.4, 0, -a), verts=6, m=M["gold"])
    # face — glass eyes, painted smile that is slightly wrong
    for s in (-1, 1):
        meshpart(head, "sph", f"Sera_EyeSkt{s}", 0.06, (s*0.095, -0.155, 0.20), (1,1,1), m=M["dark"])
        meshpart(head, "sph", f"Sera_Eye{s}", 0.042, (s*0.095, -0.185, 0.20), (1,1,1), m=M["glass"])
    meshpart(head, "sph", "Sera_Nose", 0.02, (0, -0.225, 0.12), (1,1,1), m=M["shell"])
    # painted smile — thin torus arc, too wide
    smile = meshpart(head, "torus", "Sera_Smile", 0.085, 0.012, (0, -0.20, 0.02),
                     rot=(PI/2+0.25, 0, 0), mj=20, mn=6, arc=PI*0.85, m=M["crack"])
    # jaw behind the painted smile — real teeth when it opens
    jaw = joint("Sera_Jaw", (0, -0.05, 0.0), head)
    meshpart(jaw, "sph", "Sera_JawMass", 0.10, (0, -0.12, -0.05), (1.1, 1.0, 0.6), m=M["shell"])
    for i in range(6):
        x = -0.075 + i*0.03
        meshpart(jaw, "box", f"Sera_Tooth{i}", (0.018, 0.02, 0.045), (x, -0.185, 0.0), m=M["teeth"])
    # crack across the left cheek (thin boxes)
    meshpart(head, "box", "Sera_Crack1", (0.006, 0.01, 0.16), (-0.13, -0.185, 0.16), rot=(0, 0.3, 0.5), m=M["crack"])
    meshpart(head, "box", "Sera_Crack2", (0.006, 0.01, 0.10), (-0.09, -0.21, 0.06), rot=(0.2, 0.1, -0.4), m=M["crack"])
    # arms — long, thin, extra elbow joint (uncanny) — joints aligned with cylinders
    for s in (-1, 1):
        sh = joint(f"Sera_Shoulder{s}", (s*0.26, 0, 0.40), hips)
        meshpart(sh, "sph", f"Sera_ShBall{s}", 0.055, (0,0,0), (1,1,1), m=M["gold"])
        meshpart(sh, "cyl", f"Sera_UpperArm{s}", 0.035, 0.34, (0, 0, -0.17), verts=10, m=M["shell"])
        e1 = joint(f"Sera_ElbowA{s}", (0, 0, -0.36), sh)
        meshpart(e1, "sph", f"Sera_ElbowBallA{s}", 0.042, (0,0,0), (1,1,1), m=M["gold"])
        meshpart(sh, "cyl", f"Sera_ForeArm{s}", 0.030, 0.30, (0, 0, -0.51), verts=10, m=M["shell"])
        e2 = joint(f"Sera_ElbowB{s}", (0, 0, -0.30), e1)   # -0.66 in shoulder space
        meshpart(e2, "sph", f"Sera_ElbowBallB{s}", 0.038, (0,0,0), (1,1,1), m=M["gold"])
        meshpart(sh, "cyl", f"Sera_HandArm{s}", 0.026, 0.24, (0, 0, -0.78), verts=10, m=M["shell"])
        meshpart(e2, "cone", f"Sera_Fingers{s}", 0.035, 0.10, (0, 0, -0.28), rot=(PI, 0, 0), verts=8, m=M["shell"])
    # legs — ballerina, en pointe gold spikes for feet (knee -0.58 in hip space; ankle => -0.56 in knee space)
    for s in (-1, 1):
        hp = joint(f"Sera_Hip{s}", (s*0.12, 0, -0.10), hips)
        meshpart(hp, "sph", f"Sera_HipBall{s}", 0.055, (0,0,0), (1,1,1), m=M["gold"])
        meshpart(hp, "cyl", f"Sera_Thigh{s}", 0.045, 0.56, (0, 0, -0.28), verts=10, m=M["shell"])
        kn = joint(f"Sera_Knee{s}", (0, 0, -0.58), hp)
        meshpart(kn, "sph", f"Sera_KneeBall{s}", 0.05, (0,0,0), (1,1,1), m=M["gold"])
        meshpart(hp, "cyl", f"Sera_Shin{s}", 0.038, 0.56, (0, 0, -0.86), verts=10, m=M["shell"])
        ft = joint(f"Sera_Ankle{s}", (0, 0, -0.56), kn)
        meshpart(ft, "cone", f"Sera_Pointe{s}", 0.045, 0.14, (0, -0.02, -0.07), rot=(PI, 0, 0), verts=10, m=M["gold"])

    join_children(root)
    export_glb(root, os.path.join(OUT, "sera.glb"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "sera.blend"))
    setup_render(res=(720, 900))
    add_render_rig(center=(0,0,1.0), dist=3.0, height=1.5, yaw_deg=30)
    bpy.context.scene.render.filepath = os.path.join(REN, "sera_front.png"); bpy.ops.render.render(write_still=True)
    print("SERA OK")
    return root

# ============================================================ BOLT
def build_bolt():
    reset_scene()
    M = {
      "suit":  mat("Bolt_Suit",  (0.55, 0.10, 0.12), roughness=0.6),
      "suit2": mat("Bolt_Suit2", (0.10, 0.10, 0.14), roughness=0.6),
      "skin":  mat("Bolt_Skin",  (0.90, 0.78, 0.62), roughness=0.5),
      "nose":  mat("Bolt_Nose",  (0.95, 0.15, 0.10), emit=(1.2, 0.10, 0.05), emit_str=2.2),
      "teeth": mat("Teeth",      (0.92, 0.9, 0.84), roughness=0.35),
      "gum":   mat("Bolt_Gum",   (0.35, 0.06, 0.08), roughness=0.7),
      "metal": mat("Bolt_Metal", (0.30, 0.31, 0.36), metallic=0.85, roughness=0.4),
      "hair":  mat("Bolt_Hair",  (0.75, 0.45, 0.08), roughness=0.65),
      "eyeY":  mat("Eye_Yolk",   (0.93, 0.88, 0.70), roughness=0.25),
      "eyeB":  mat("Eye_Black",  (0.01, 0.01, 0.012), roughness=0.15),
    }
    root = joint("Bolt_Root", (0, 0, 0))
    hips = joint("Bolt_Hips", (0, 0, 1.34), root)
    # torso — lumpy suit with patch panels
    meshpart(hips, "sph", "Bolt_Torso", 0.42, (0, 0, 0.16), (1.0, 0.8, 1.15), m=M["suit"])
    meshpart(hips, "box", "Bolt_Patch", (0.20, 0.02, 0.24), (-0.16, -0.36, 0.18), rot=(0.1, 0, 0.3), m=M["suit2"])
    meshpart(hips, "box", "Bolt_Patch2", (0.14, 0.02, 0.16), (0.18, -0.33, -0.05), rot=(-0.1, 0, -0.2), m=M["skin"])
    # ruff collar
    meshpart(hips, "torus", "Bolt_Ruff", 0.22, 0.09, (0, 0, 0.48), rot=(PI/2, 0, 0), mj=20, mn=10, m=M["skin"])
    # head
    head = joint("Bolt_Head", (0, 0, 0.66), hips)
    skull = meshpart(head, "sph", "Bolt_Skull", 0.28, (0, 0, 0.16), (1.0, 0.92, 1.05), m=M["skin"])
    # painted half-face: dark plate on right side
    meshpart(head, "sph", "Bolt_FacePlate", 0.245, (0.075, 0.005, 0.155), (0.92, 0.9, 0.98), m=M["suit2"])
    # eyes — one normal, one too big
    meshpart(head, "sph", "Bolt_EyeL", 0.058, (-0.105, -0.215, 0.225), (1,1,1), m=M["eyeY"])
    meshpart(head, "sph", "Bolt_PupL", 0.028, (-0.115, -0.262, 0.228), (1,1,1), m=M["eyeB"])
    meshpart(head, "sph", "Bolt_EyeR", 0.085, (0.115, -0.195, 0.235), (1,1,1), m=M["eyeY"])
    meshpart(head, "sph", "Bolt_PupR", 0.020, (0.125, -0.272, 0.238), (1,1,1), m=M["eyeB"])
    # huge grin — jaw hinged low, big teeth, dark gums
    jaw = joint("Bolt_Jaw", (0, -0.04, 0.02), head)
    meshpart(jaw, "sph", "Bolt_JawMass", 0.16, (0, -0.14, -0.06), (1.25, 1.0, 0.65), m=M["skin"])
    meshpart(jaw, "box", "Bolt_GumRow", (0.30, 0.05, 0.03), (0, -0.21, 0.03), m=M["gum"])
    for i in range(8):
        x = -0.135 + i*0.0385
        meshpart(jaw, "box", f"Bolt_ToothU{i}", (0.026, 0.035, 0.075), (x, -0.215, 0.075), m=M["teeth"])
        meshpart(head, "box", f"Bolt_ToothL{i}", (0.026, 0.035, 0.07), (x, -0.225, 0.015), m=M["teeth"])
    # round squeaky nose (glows faint)
    meshpart(head, "sph", "Bolt_Nose", 0.055, (0, -0.27, 0.13), (1,1,1), m=M["nose"])
    # wild orange hair tufts
    for i, (dx, dz) in enumerate([(-0.16,0.38),(0,0.46),(0.16,0.38),(-0.26,0.28),(0.26,0.28)]):
        meshpart(head, "cone", f"Bolt_Hair{i}", 0.05, 0.16, (dx, 0.02, dz),
                 rot=(0.3*(dz-0.4), 0, dx*2.2), verts=6, m=M["hair"])
    # tiny hat
    meshpart(head, "cyl", "Bolt_HatBrim", 0.10, 0.015, (0, 0.02, 0.47), verts=14, m=M["suit"])
    meshpart(head, "cyl", "Bolt_HatTop", 0.06, 0.09, (0, 0.02, 0.52), verts=14, m=M["suit2"])
    # arms — overly long, big gloves (joints aligned with cylinders)
    for s in (-1, 1):
        sh = joint(f"Bolt_Shoulder{s}", (s*0.40, 0, 0.36), hips)
        meshpart(sh, "sph", f"Bolt_ShBall{s}", 0.09, (0,0,0), (1,1,1), m=M["metal"])
        meshpart(sh, "cyl", f"Bolt_UpperArm{s}", 0.06, 0.42, (0, 0, -0.23), verts=10,
                 m=M["suit"] if s < 0 else M["suit2"])
        el = joint(f"Bolt_Elbow{s}", (0, 0, -0.46), sh)
        meshpart(el, "sph", f"Bolt_ElbowBall{s}", 0.07, (0,0,0), (1,1,1), m=M["metal"])
        meshpart(sh, "cyl", f"Bolt_ForeArm{s}", 0.05, 0.40, (0, 0, -0.66), verts=10, m=M["suit"])
        wr = joint(f"Bolt_Wrist{s}", (0, 0, -0.42), el)   # -0.88 in shoulder space
        meshpart(wr, "sph", f"Bolt_Glove{s}", 0.11, (0, 0, -0.06), (1.0, 0.9, 1.15), m=M["skin"])
    # legs — short with enormous flat shoes (knee -0.46 in hip space; ankle => -0.46 in knee space)
    for s in (-1, 1):
        hp = joint(f"Bolt_Hip{s}", (s*0.17, 0, -0.14), hips)
        meshpart(hp, "cyl", f"Bolt_Thigh{s}", 0.075, 0.44, (0, 0, -0.22), verts=10, m=M["suit2"])
        kn = joint(f"Bolt_Knee{s}", (0, 0, -0.46), hp)
        meshpart(kn, "sph", f"Bolt_KneeBall{s}", 0.075, (0,0,0), (1,1,1), m=M["metal"])
        meshpart(hp, "cyl", f"Bolt_Shin{s}", 0.065, 0.44, (0, 0, -0.68), verts=10, m=M["suit2"])
        ft = joint(f"Bolt_Ankle{s}", (0, 0, -0.46), kn)
        meshpart(ft, "box", f"Bolt_Shoe{s}", (0.20, 0.52, 0.11), (0, -0.12, -0.055), rot=(0, s*0.06, 0), m=M["skin"])
        meshpart(ft, "sph", f"Bolt_ShoeTip{s}", 0.075, (0, -0.32, -0.05), (1, 0.8, 0.7), m=M["nose"])

    join_children(root)
    export_glb(root, os.path.join(OUT, "bolt.glb"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "bolt.blend"))
    setup_render(res=(720, 900))
    add_render_rig(center=(0,0,1.0), dist=3.0, height=1.5, yaw_deg=30)
    bpy.context.scene.render.filepath = os.path.join(REN, "bolt_front.png"); bpy.ops.render.render(write_still=True)
    print("BOLT OK")
    return root

# ============================================================ WONDER-0
def build_wonder():
    reset_scene()
    M = {
      "body": mat("W0_Body",  (0.016, 0.016, 0.022), roughness=0.55),
      "mask": mat("W0_Mask",  (0.92, 0.91, 0.89), roughness=0.35),
      "stripe":mat("W0_Stripe",(0.85, 0.72, 0.16), roughness=0.45),
      "glowE": mat("W0_Eyes", (0.01, 0.01, 0.01), emit=(0.65, 0.85, 1.0), emit_str=6.0),
      "glowM": mat("W0_Mouth",(0.01, 0.01, 0.01), emit=(0.9, 0.15, 0.10), emit_str=4.0),
      "bar":   mat("W0_Bar",  (0.12, 0.12, 0.14), metallic=0.8, roughness=0.35),
      "string":mat("W0_String",(0.75, 0.75, 0.78), roughness=0.6),
      "teeth": mat("Teeth",   (0.9, 0.88, 0.8), roughness=0.4),
    }
    root = joint("W0_Root", (0, 0, 0))
    bar = joint("W0_ControlBar", (0, 0, 2.62), root)
    meshpart(bar, "box", "W0_BarMain", (0.70, 0.05, 0.05), (0, 0, 0), m=M["bar"])
    meshpart(bar, "box", "W0_BarCross", (0.05, 0.05, 0.50), (0, 0, 0), rot=(0, PI/2, 0), m=M["bar"])
    hips = joint("W0_Hips", (0, 0, 1.52), root)
    # strings from bar to body
    for tx, tz in [(-0.30, 0.0), (0.30, 0.0), (0.0, -0.24), (-0.22, -0.24), (0.22, -0.24)]:
        sx, sz = tx*0.55, tz*0.55
        dx, dy, dz = tx-sx, 0, tz-(sz+1.06)
        L = math.sqrt(dx*dx+dz*dz)
        ang = math.atan2(dx, -dz)
        meshpart(bar, "cyl", f"W0_String{tx}{tz}", 0.006, L, ((tx+sx)/2, -0.02, (tz+sz)/2 + 1.06),
                 rot=(ang, 0, 0), verts=5, m=M["string"])
    # body — gaunt black figure
    meshpart(hips, "sph", "W0_Torso", 0.20, (0, 0, 0.10), (0.75, 0.55, 1.6), m=M["body"])
    meshpart(hips, "sph", "W0_Chest", 0.16, (0, 0, 0.42), (0.8, 0.6, 1.1), m=M["body"])
    # white button dots down the front
    for i in range(4):
        meshpart(hips, "sph", f"W0_Button{i}", 0.018, (0, -0.135, 0.02 + i*0.13), (1,1,1), m=M["mask"])
    head = joint("W0_Head", (0, 0, 0.60), hips)
    meshpart(head, "sph", "W0_Neck", 0.045, (0, 0, -0.02), (1,1,1), m=M["body"])
    # smooth white mask
    meshpart(head, "sph", "W0_Mask", 0.19, (0, 0, 0.14), (0.82, 0.85, 1.12), m=M["mask"])
    # eye holes glow cold blue
    for s in (-1, 1):
        meshpart(head, "sph", f"W0_EyeHole{s}", 0.048, (s*0.075, -0.145, 0.19), (1.15, 1.15, 1.0), m=M["body"])
        meshpart(head, "sph", f"W0_Eye{s}", 0.036, (s*0.075, -0.165, 0.19), (1,1,1), m=M["glowE"])
    # smiling mouth slit glows red when hunting
    meshpart(head, "box", "W0_MouthGlow", (0.11, 0.02, 0.028), (0, -0.175, 0.055), m=M["glowM"])
    for i in range(5):
        x = -0.045 + i*0.0225
        meshpart(head, "box", f"W0_Tooth{i}", (0.014, 0.012, 0.02), (x, -0.178, 0.055), m=M["teeth"])
    # jester hat cones
    for s, col in ((-1, M["body"]), (1, M["stripe"])):
        meshpart(head, "cone", f"W0_Horn{s}", 0.045, 0.20, (s*0.11, 0.02, 0.34),
                 rot=(0.25*s*-1 if False else 0.0, 0, s*0.55), verts=8, m=col)
        meshpart(head, "sph", f"W0_HornBell{s}", 0.022, (s*0.185, 0.02, 0.43), (1,1,1), m=M["glowM"])
    # arms — endless thin stripes
    for s in (-1, 1):
        sh = joint(f"W0_Shoulder{s}", (s*0.20, 0, 0.40), hips)
        meshpart(sh, "sph", f"W0_ShBall{s}", 0.045, (0,0,0), (1,1,1), m=M["body"])
        nseg = 3
        par = sh; drop = 0.0
        for k in range(nseg):
            seglen = 0.34
            mm = M["body"] if k % 2 == 0 else M["stripe"]
            meshpart(par, "cyl", f"W0_ArmSeg{s}{k}", 0.028, seglen, (0, 0, -seglen/2), verts=8, m=mm)
            nj = new_empty(f"W0_ArmJ{s}{k}", loc=(0, 0, -seglen), parent=par)
            drop -= seglen; par = nj
        meshpart(par, "sph", f"W0_Hand{s}", 0.055, (0, 0, -0.05), (1.0, 1.0, 1.4), m=M["body"])
        for fi in range(4):
            a = fi/4 * TAU
            meshpart(par, "cyl", f"W0_Finger{s}{fi}", 0.010, 0.16,
                     (math.sin(a)*0.03, math.cos(a)*0.02, -0.16), rot=(0.12*math.cos(a), 0.12*math.sin(a), 0),
                     verts=5, m=M["body"])
    # legs (knee -0.62 in hip space; ankle => -0.60 in knee space)
    for s in (-1, 1):
        hp = joint(f"W0_Hip{s}", (s*0.09, 0, -0.06), hips)
        meshpart(hp, "cyl", f"W0_Thigh{s}", 0.035, 0.62, (0, 0, -0.31), verts=8, m=M["body"])
        kn = new_empty(f"W0_Knee{s}", loc=(0, 0, -0.62), parent=hp)
        meshpart(hp, "cyl", f"W0_Shin{s}", 0.030, 0.60, (0, 0, -0.92), verts=8, m=M["stripe"])
        ft = new_empty(f"W0_Ankle{s}", loc=(0, 0, -0.60), parent=kn)
        meshpart(ft, "box", f"W0_Foot{s}", (0.09, 0.24, 0.06), (0, -0.05, -0.03), m=M["body"])

    join_children(root)
    export_glb(root, os.path.join(OUT, "wonder.glb"))
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "wonder.blend"))
    setup_render(res=(720, 900))
    add_render_rig(center=(0,0,1.2), dist=3.6, height=1.8, yaw_deg=30)
    bpy.context.scene.render.filepath = os.path.join(REN, "wonder_front.png"); bpy.ops.render.render(write_still=True)
    print("WONDER OK")
    return root

# ============================================================ RUNNER
if __name__ == "__main__":
    import traceback
    which = os.environ.get("WD_CHAR", "all").lower()
    builders = {"orv": build_orv, "rivets": build_rivets, "sera": build_sera,
                "bolt": build_bolt, "wonder": build_wonder}
    targets = list(builders.keys()) if which == "all" else [which]
    failed = []
    for t in targets:
        try:
            builders[t]()
            print(f"=== {t} DONE ===")
            # bounds sanity: whole character should be ~1.6-2.9m tall, centered near origin
            import mathutils, bpy
            mn=[1e9]*3; mx=[-1e9]*3
            for ob in bpy.data.objects:
                if ob.type!='MESH': continue
                for corner in ob.bound_box:
                    wc=ob.matrix_world @ mathutils.Vector(corner)
                    for i in range(3):
                        mn[i]=min(mn[i],wc[i]); mx[i]=max(mx[i],wc[i])
            print(f"BOUNDS {t}: min={[round(v,2) for v in mn]} max={[round(v,2) for v in mx]} height={round(mx[2]-mn[2],2)}")
        except Exception:
            failed.append(t)
            print(f"!!! {t} FAILED !!!")
            traceback.print_exc()
    print("SUMMARY:", "ALL_OK" if not failed else f"FAILED:{failed}")

