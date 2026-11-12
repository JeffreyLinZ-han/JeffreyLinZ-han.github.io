"""Export the OpenArm MJCF assembly for HQViewer, using MuJoCo and NumPy.

Example:
    python tools/export_harvesting_viewer.py --scene /robot/generated/scene_bush.xml

The browser model is kinematic: passive belts and plant coordinates stay at the
source home pose, while the original URDF follower ratios drive each gripper.
"""

import argparse
from collections import defaultdict
import gzip
import hashlib
import json
from pathlib import Path
import subprocess

import mujoco
import numpy as np


IDENTITY = np.eye(4)


def transform(position, rotation):
    result = np.eye(4)
    result[:3, :3] = np.asarray(rotation).reshape(3, 3)
    result[:3, 3] = position
    return result


def flat(matrix):
    return np.asarray(matrix).reshape(-1, order='F').tolist()


def transformed(geometry, matrix):
    vertices, normals, faces = geometry
    return (vertices @ matrix[:3, :3].T + matrix[:3, 3],
            normals @ matrix[:3, :3].T, faces)


def surface_of_revolution(radii, heights, radial_normals, vertical_normals, segments):
    angles = np.arange(segments) * (2 * np.pi / segments)
    circle = np.column_stack((np.cos(angles), np.sin(angles)))
    rings = len(radii)
    vertices = np.empty((rings, segments, 3))
    normals = np.empty_like(vertices)
    vertices[:, :, :2] = np.asarray(radii)[:, None, None] * circle
    vertices[:, :, 2] = np.asarray(heights)[:, None]
    normals[:, :, :2] = np.asarray(radial_normals)[:, None, None] * circle
    normals[:, :, 2] = np.asarray(vertical_normals)[:, None]
    faces = []
    for row in range(rings - 1):
        for column in range(segments):
            a = row * segments + column
            b = row * segments + (column + 1) % segments
            c, d = a + segments, b + segments
            faces.extend(((a, b, d), (a, d, c)))
    vertices, normals = vertices.reshape(-1, 3), normals.reshape(-1, 3)
    faces = np.asarray(faces, dtype=np.uint32)
    triangles = vertices[faces]
    valid = np.linalg.norm(np.cross(triangles[:, 1] - triangles[:, 0],
                                    triangles[:, 2] - triangles[:, 0]), axis=1) > 1e-15
    faces = faces[valid]
    # Rings run bottom to top, so these triangle edges face outwards.
    cross = np.cross(vertices[faces[:, 1]] - vertices[faces[:, 0]],
                     vertices[faces[:, 2]] - vertices[faces[:, 0]])
    reversed_faces = np.sum(cross * normals[faces[:, 0]], axis=1) < 0
    faces[reversed_faces] = faces[reversed_faces][:, [0, 2, 1]]
    return vertices, normals, faces


def primitive(kind, size, background):
    if kind in (mujoco.mjtGeom.mjGEOM_SPHERE, mujoco.mjtGeom.mjGEOM_ELLIPSOID):
        segments, rings = (10, 6) if background else (24, 12)
        latitude = np.linspace(-np.pi / 2, np.pi / 2, rings + 1)
        geometry = surface_of_revolution(np.cos(latitude), np.sin(latitude),
                                         np.cos(latitude), np.sin(latitude), segments)
        scale = np.repeat(size[0], 3) if kind == mujoco.mjtGeom.mjGEOM_SPHERE else size
        vertices, normals, faces = geometry
        vertices = vertices * scale
        normals = normals / scale
        normals /= np.linalg.norm(normals, axis=1)[:, None]
        return vertices, normals, faces
    if kind == mujoco.mjtGeom.mjGEOM_CAPSULE:
        radius, half = size[:2]
        latitude = np.concatenate((np.linspace(-np.pi / 2, 0, 4),
                                   np.linspace(0, np.pi / 2, 4)))
        heights = radius * np.sin(latitude) + np.repeat([-half, half], 4)
        return surface_of_revolution(radius * np.cos(latitude), heights,
                                     np.cos(latitude), np.sin(latitude), 10 if background else 20)
    if kind == mujoco.mjtGeom.mjGEOM_BOX:
        vertices, normals, faces = [], [], []
        for axis in range(3):
            other = [i for i in range(3) if i != axis]
            for sign in (-1, 1):
                start = len(vertices)
                normal = np.zeros(3)
                normal[axis] = sign
                for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                    point = np.zeros(3)
                    point[axis], point[other[0]], point[other[1]] = sign, x, y
                    vertices.append(point * size)
                    normals.append(normal)
                a, b, c = np.asarray(vertices[start:start + 3])
                order = (0, 1, 2, 0, 2, 3) if np.dot(np.cross(b - a, c - a), normal) > 0 else (0, 2, 1, 0, 3, 2)
                faces.extend(np.asarray(order).reshape(2, 3) + start)
        return np.asarray(vertices), np.asarray(normals), np.asarray(faces, dtype=np.uint32)
    if kind == mujoco.mjtGeom.mjGEOM_CYLINDER:
        radius, half = size[:2]
        return surface_of_revolution([0, radius, radius, radius, radius, 0],
                                     [-half, -half, -half, half, half, half],
                                     [0, 0, 1, 1, 0, 0], [-1, -1, 0, 0, 1, 1], 24)
    raise ValueError(f'Unsupported visible primitive: {mujoco.mjtGeom(kind).name}')


def cad_mesh(model, mesh):
    vertex_start, vertex_count = model.mesh_vertadr[mesh], model.mesh_vertnum[mesh]
    face_start, face_count = model.mesh_faceadr[mesh], model.mesh_facenum[mesh]
    normal_start, normal_count = model.mesh_normaladr[mesh], model.mesh_normalnum[mesh]
    vertices = model.mesh_vert[vertex_start:vertex_start + vertex_count]
    faces = model.mesh_face[face_start:face_start + face_count]
    normal_faces = model.mesh_facenormal[face_start:face_start + face_count]
    if normal_count and np.all(normal_faces >= 0):
        normals = model.mesh_normal[normal_start:normal_start + normal_count]
        pairs, inverse = np.unique(np.column_stack((faces.reshape(-1), normal_faces.reshape(-1))),
                                   axis=0, return_inverse=True)
        return vertices[pairs[:, 0]].copy(), normals[pairs[:, 1]].copy(), inverse.reshape(-1, 3).astype(np.uint32)
    points = vertices[faces].reshape(-1, 3)
    triangles = points.reshape(-1, 3, 3)
    normals = np.cross(triangles[:, 1] - triangles[:, 0], triangles[:, 2] - triangles[:, 0])
    normals /= np.maximum(np.linalg.norm(normals, axis=1)[:, None], 1e-30)
    return points.copy(), np.repeat(normals, 3, axis=0), np.arange(len(points), dtype=np.uint32).reshape(-1, 3)


class GeometryStore:
    def __init__(self):
        self.meshes, self.vertices, self.indices, self.keys = [], [], [], {}
        self.vertex_bytes = self.index_bytes = 0

    def add(self, name, geometry):
        vertices, normals, faces = geometry
        low, high = vertices.min(axis=0), vertices.max(axis=0)
        extent = high - low
        coordinates = np.rint((vertices - low) / np.maximum(extent, 1e-30) * 65535)
        packed = np.empty((len(vertices), 6), dtype='<u2')
        packed[:, :3] = np.clip(coordinates, 0, 65535).astype('<u2')
        normals = normals / np.maximum(np.linalg.norm(normals, axis=1)[:, None], 1e-30)
        packed[:, 3:] = np.rint(np.clip(normals, -1, 1) * 32767).astype('<i2').view('<u2')
        vertex_data, index_data = packed.tobytes(), np.asarray(faces, dtype='<u4').tobytes()
        digest = hashlib.sha256(np.asarray([low, extent], dtype='<f8').tobytes() + vertex_data + index_data).digest()
        if digest in self.keys:
            return self.keys[digest]
        index = len(self.meshes)
        self.keys[digest] = index
        self.meshes.append(dict(name=name, vertexByteOffset=self.vertex_bytes, vertexCount=len(vertices),
                                indexByteOffset=self.index_bytes, indexCount=faces.size,
                                bboxMin=low.tolist(), bboxSize=extent.tolist(), triangles=len(faces)))
        self.vertices.append(vertex_data)
        self.indices.append(index_data)
        self.vertex_bytes += len(vertex_data)
        self.index_bytes += len(index_data)
        return index

    def write(self, path):
        with path.open('wb') as stream, gzip.GzipFile(filename='', fileobj=stream, mode='wb', mtime=0, compresslevel=9) as packed:
            for chunk in self.vertices + self.indices:
                packed.write(chunk)


def assembly_nodes(model, data, follower_ratios):
    controls, driven = [], {}
    for side in ('left', 'right'):
        group = side.title() + ' arm'
        for number in range(1, 8):
            name = f'openarm_{side}_joint{number}'
            joint = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_JOINT, name)
            if joint < 0:
                raise ValueError(f'Missing OpenArm joint: {name}')
            value = float(data.qpos[model.jnt_qposadr[joint]])
            driven[joint] = (len(controls), 1)
            controls.append(dict(name=name, label=f'Joint {number}', group=group,
                                 min=float(model.jnt_range[joint, 0]), max=float(model.jnt_range[joint, 1]),
                                 step=0.005, value=value, display='deg'))
        master = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_JOINT, f'{side}_bb_HR11J')
        control = len(controls)
        controls.append(dict(name=f'{side}_gripper', label='Gripper closure', group=group,
                             min=float(model.jnt_range[master, 0]), max=float(model.jnt_range[master, 1]),
                             step=0.005, value=float(data.qpos[model.jnt_qposadr[master]]), display='deg'))
        for suffix, multiplier in follower_ratios.items():
            joint = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_JOINT, f'{side}_bb_{suffix}')
            if joint < 0:
                raise ValueError(f'Missing gripper follower: {side}_bb_{suffix}')
            driven[joint] = (control, multiplier)
    body_joints = {int(model.jnt_bodyid[joint]): joint for joint in driven}
    nodes = [dict(name='world', parent=-1, static=flat(IDENTITY), joint=None)]
    owners = np.zeros(model.nbody, dtype=int)
    world = [IDENTITY]
    for body in range(1, model.nbody):
        parent = int(owners[model.body_parentid[body]])
        if body not in body_joints:
            owners[body] = parent
            continue
        joint = body_joints[body]
        control, scale = driven[joint]
        pose = transform(data.xpos[body], data.xmat[body])
        owners[body] = len(nodes)
        nodes.append(dict(name=mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_BODY, body),
                          parent=parent, static=flat(np.linalg.inv(world[parent]) @ pose),
                          joint=dict(name=mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_JOINT, joint),
                                     control=control, type='hinge', axis=model.jnt_axis[joint].tolist(),
                                     pos=model.jnt_pos[joint].tolist(), scale=scale,
                                     ref=float(data.qpos[model.jnt_qposadr[joint]]))))
        world.append(pose)
    return nodes, controls, owners, world


def material(model, geom, group):
    color = model.geom_rgba[geom].copy()
    identifier = int(model.geom_matid[geom])
    if identifier >= 0 and np.array_equal(color, np.array([0.5, 0.5, 0.5, 1], dtype=color.dtype)):
        color = model.mat_rgba[identifier]
    if identifier >= 0:
        metalness, roughness = float(model.mat_metallic[identifier]), float(model.mat_roughness[identifier])
    else:
        metalness, roughness = (0.12, 0.48) if group == 'robot' else (0.0, 0.7)
    return tuple(map(float, color)), metalness, max(0.25, roughness)


def export(scene, destination, gripper_config):
    model = mujoco.MjModel.from_xml_path(str(scene))
    data = mujoco.MjData(model)
    home = mujoco.mj_name2id(model, mujoco.mjtObj.mjOBJ_KEY, 'home')
    if home < 0:
        raise ValueError('The generated MJCF must contain the home keyframe.')
    mujoco.mj_resetDataKeyframe(model, data, home)
    mujoco.mj_forward(model, data)
    ratios = json.loads(gripper_config.read_text(encoding='utf-8'))['urdf_mimic_multipliers']
    nodes, controls, owners, owner_world = assembly_nodes(model, data, ratios)
    inverse_world = [np.linalg.inv(matrix) for matrix in owner_world]
    geometry, mesh_cache, groups, drawables = GeometryStore(), {}, defaultdict(list), []
    included = omitted = 0

    def drawable(mesh, node, local, appearance, group, name, focus):
        color, metalness, roughness = appearance
        drawables.append(dict(mesh=mesh, node=node, local=flat(local), color=list(color),
                              metalness=metalness, roughness=roughness, group=group, name=name, focus=focus))

    for geom in range(model.ngeom):
        kind = int(model.geom_type[geom])
        if model.geom_group[geom] > 2 or model.geom_rgba[geom, 3] <= 0 or kind == mujoco.mjtGeom.mjGEOM_PLANE:
            omitted += 1
            continue
        body = int(model.geom_bodyid[geom])
        body_name = mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_BODY, body) or 'world'
        name = mujoco.mj_id2name(model, mujoco.mjtObj.mjOBJ_GEOM, geom) or f'geom_{geom}'
        background = body_name == 'bush_background'
        group = 'plant' if background or body_name.startswith('inspection_') else 'robot'
        if body_name.startswith('inspection_berry'):
            group = 'berries'
        appearance = material(model, geom, group)
        owner = int(owners[body])
        focus = 'gripper' if '_bb_' in body_name else group
        local = inverse_world[owner] @ transform(data.geom_xpos[geom], data.geom_xmat[geom])
        if kind == mujoco.mjtGeom.mjGEOM_MESH:
            mesh_id = int(model.geom_dataid[geom])
            if mesh_id not in mesh_cache:
                mesh_cache[mesh_id] = cad_mesh(model, mesh_id)
            source = mesh_cache[mesh_id]
            if len(source[2]) >= 5000:
                mesh = geometry.add(name, source)
                drawable(mesh, owner, local, appearance, group, name, focus)
                included += 1
                continue
        else:
            source = primitive(kind, model.geom_size[geom], background)
        key = (owner, appearance, group, focus)
        groups[key].append(transformed(source, local))
        included += 1

    for (owner, appearance, group, focus), chunks in groups.items():
        vertices, normals, faces, offset = [], [], [], 0
        for points, directions, triangles in chunks:
            vertices.append(points)
            normals.append(directions)
            faces.append(triangles + offset)
            offset += len(points)
        name = f'{nodes[owner]["name"]}_{group}_{len(drawables)}'
        mesh = geometry.add(name, (np.concatenate(vertices), np.concatenate(normals), np.concatenate(faces)))
        drawable(mesh, owner, IDENTITY, appearance, group, name, focus)

    destination.parent.mkdir(parents=True, exist_ok=True)
    binary = destination.with_suffix('.bin.gz')
    geometry.write(binary)
    home_values = [control['value'] for control in controls]
    close_values = home_values.copy()
    close_values[7] = close_values[15] = 1.0
    pose_values = close_values.copy()
    for index, shift in ((0, 0.15), (2, 0.15), (8, -0.15), (10, -0.15)):
        pose_values[index] = float(np.clip(pose_values[index] + shift, controls[index]['min'], controls[index]['max']))
    digest = hashlib.sha256(scene.read_bytes()).hexdigest()
    manifest = dict(
        name='OpenArm Blueberry Harvesting', data=binary.name, vertexBytes=geometry.vertex_bytes,
        rawBytes=geometry.vertex_bytes + geometry.index_bytes, gzipBytes=binary.stat().st_size,
        meshes=geometry.meshes, nodes=nodes, drawables=drawables, controls=controls,
        camera=dict(yaw=-2.4, pitch=0.28, fitGroups=['robot', 'berries']),
        demo=[dict(duration=2.5, values=close_values), dict(duration=3.0, values=pose_values),
              dict(duration=3.0, values=home_values)],
        stats=dict(triangles=sum(geometry.meshes[d['mesh']]['triangles'] for d in drawables),
                   trianglesUnique=sum(mesh['triangles'] for mesh in geometry.meshes),
                   sourceGeometries=model.ngeom, visibleSourceGeometries=included,
                   omittedCollisionAndGroundGeometries=omitted, drawCalls=len(drawables)),
        assetVersion='openarm-mjcf-' + digest[:16], shadingSharpness=0.08,
        provenance=dict(sourceModel=scene.name, sourceSha256=digest,
                        sourceRepository='https://github.com/JeffreyLinZ-han/Blue_Berry_Harvesting_Bot',
                        mujocoVersion=mujoco.__version__,
                        geometry='Source CAD triangles retained; analytic primitives tessellated; positions quantized to 16 bits per mesh.',
                        kinematics='Fourteen arm joints and two closure controls. Gripper followers use the source URDF parallelogram ratios.',
                        scope='Kinematic browser assembly. Passive belts and plant coordinates are frozen at home; no contact, deformation or picking physics runs in the browser.'))
    revision = subprocess.run(['git', '-C', str(scene.parent.parent), 'rev-parse', 'HEAD'],
                              capture_output=True, text=True, check=False)
    if revision.returncode == 0:
        manifest['provenance']['sourceRevision'] = revision.stdout.strip()
    destination.write_text(json.dumps(manifest, separators=(',', ':'), ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps(dict(manifest=str(destination), binary=str(binary), **manifest['stats'],
                          gzipBytes=manifest['gzipBytes'], controls=len(controls), nodes=len(nodes)), indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--scene', required=True, type=Path)
    parser.add_argument('--output', type=Path,
                        default=Path(__file__).resolve().parents[1] / 'demos/harvesting/openarm.json')
    parser.add_argument('--gripper-config', type=Path)
    args = parser.parse_args()
    scene = args.scene.expanduser().resolve()
    config = args.gripper_config or scene.parent.parent / 'src/blueberry_gripper_description/config/gripper.json'
    export(scene, args.output.expanduser().resolve(), config)


if __name__ == '__main__':
    main()
