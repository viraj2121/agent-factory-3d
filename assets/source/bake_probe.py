import bpy

# Probe: does the bake operator run under safe mode, and does it produce light?
sc = bpy.context.scene
previous_engine = sc.render.engine

for name in ("Probe_Plane", "Probe_Cube"):
    ob = bpy.data.objects.get(name)
    if ob:
        bpy.data.objects.remove(ob, do_unlink=True)

bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
plane = bpy.context.active_object
plane.name = "Probe_Plane"
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.5))
cube = bpy.context.active_object
cube.name = "Probe_Cube"

img = bpy.data.images.get("ProbeBake") or bpy.data.images.new("ProbeBake", 128, 128)
mat = bpy.data.materials.get("ProbeMat") or bpy.data.materials.new("ProbeMat")
mat.use_nodes = True
tex = mat.node_tree.nodes.new("ShaderNodeTexImage")
tex.image = img
mat.node_tree.nodes.active = tex
for ob in (plane, cube):
    ob.data.materials.clear()
    ob.data.materials.append(mat)

try:
    sc.render.engine = "CYCLES"
except TypeError as err:
    print("cannot select Cycles:", err)
sc.cycles.samples = 16

for ob in bpy.data.objects:
    ob.select_set(False)
plane.select_set(True)
bpy.context.view_layer.objects.active = plane

try:
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"})
    px = list(img.pixels)
    mean = sum(px[0::4]) / (len(px) / 4)
    print("bake: works, engine", sc.render.engine, "mean red", round(mean, 4))
except Exception as err:
    print("bake: blocked or failed:", str(err)[:200])

sc.render.engine = previous_engine
