"""The pupils' motion (idle, walk, wave), the same formula as wireSkinned in assets/story/future-world.js.
angles() gives each bone a turn about the child's own axes (three.js axes: x to the child's left, y up, z forward),
as if its parent were at rest; apply_pose() puts that on an imported glTF armature in Blender.
The numbers come from POSE in child.py, stored in the armature's kk_pose (glTF extras)."""
import json, math
from mathutils import Quaternion, Vector

DEFAULTS = dict(rest_arm=0.19, idle_arm=0.08, idle_elbow=0.22, idle_sway=0.035, breathe=0.02, look=0.1, weight_shift=0.02,
                wave_raise=2.3, wave_forward=0.28, wave_bend=0.38, wave_swing=0.3, wave_rate=9.0, wave_wrist=0.18,
                wave_head_tilt=0.11, wave_lean=0.045, wave_bob=0.04)

def lerp(a, b, k):
    return a + (b - a) * k

def angles(P, t, walk=0.0, wave=0.0, speed=1.6):
    """{bone: (x, y, z)} in radians, and the hips' bob in metres."""
    p = t * math.pi * 2 * speed
    sw = math.sin(p) * 0.55 * walk
    idle = 1 - walk
    inward = P['rest_arm'] - P['idle_arm']
    sway = idle * P['idle_sway'] * math.sin(t * 1.3)
    r = P['wave_rate']
    knee = lambda ph: max(0.0, math.sin(ph)) * 0.9 * walk
    A = {
        'Body': (0, 0, idle * P['weight_shift'] * math.sin(t * 0.8)),
        'Spine': (0, 0, -wave * P['wave_lean']),
        'Chest': (idle * P['breathe'] * math.sin(t * 1.7), 0, 0),
        'Head': (wave * P['wave_bob'] * math.sin(t * r * 0.5), idle * (1 - wave) * P['look'] * math.sin(t * 0.45),
                 wave * P['wave_head_tilt'] + idle * 0.02 * math.sin(t * 0.9) + math.sin(p) * 0.03 * walk),
        'Shoulder_L': (sw * 0.8 + sway * 0.5, 0, -inward + sway),
        'Elbow_L': (-(P['idle_elbow'] + walk * 0.3), 0, 0),
        'Hand_L': (0, 0, -0.05),
        'Shoulder_R': (lerp(-sw * 0.8 - sway * 0.5, P['wave_forward'], wave), 0, lerp(inward - sway, -P['wave_raise'], wave)),
        'Elbow_R': (-(P['idle_elbow'] + walk * 0.3) * (1 - wave), 0, -wave * (P['wave_bend'] + P['wave_swing'] * math.sin(t * r))),
        'Hand_R': (0, 0, 0.05 * (1 - wave) - wave * P['wave_wrist'] * math.sin(t * r - 0.7)),
        'Hip_L': (-sw, 0, 0), 'Hip_R': (sw, 0, 0),
        'Knee_L': (knee(p - 1.4), 0, 0), 'Knee_R': (knee(p + math.pi - 1.4), 0, 0),
    }
    return A, abs(math.sin(p)) * 0.035 * walk

# three.js axes in Blender: x -> x, y (up) -> z, z (forward) -> -y
AX = {0: Vector((1, 0, 0)), 1: Vector((0, 0, 1)), 2: Vector((0, -1, 0))}

def turn(x, y, z):
    """The rotation: z first (raise to the side), then x (swing forward or back), then y (turn)."""
    return Quaternion(AX[1], y) @ Quaternion(AX[0], x) @ Quaternion(AX[2], z)

def params(rig):
    P = dict(DEFAULTS)
    try:
        P.update(json.loads(rig.get('kk_pose', '{}')))
    except Exception:
        pass
    return P

def apply_pose(rig, t=0.0, walk=0.0, wave=0.0, speed=1.6):
    """Pose an armature: basis = B^-1 E B, with B the bone's rest orientation in the armature."""
    A, bob = angles(params(rig), t, walk, wave, speed)
    W = rig.matrix_world.to_quaternion()
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (1, 0, 0, 0)
        if pb.name in A:
            E = W.inverted() @ turn(*A[pb.name]) @ W
            B = pb.bone.matrix_local.to_quaternion()
            pb.rotation_quaternion = B.inverted() @ E @ B
