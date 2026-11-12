"""Rebuild the needle viewer from STEP assembly placements and its CAD mesh library.

The library contains the original, undecimated CAD tessellation (0.1 mm).
This tool reuses those exact triangles; it does not approximate missing parts.
Both STEP inputs must use millimetres, as the SolidWorks AP214 exports do.

Example:
    python tools/export_needle_viewer.py --full-step "Assembly V0.3.STEP" \
        --actuator-step "Actuator Assembly.STEP"

Use the original reverse-engineering actuator STEP, which includes the yoke
and cross pivot. The later platform subassembly omits those two parts because
they are separate components in the complete platform.
"""

from __future__ import annotations

import argparse
import copy
import gzip
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlsplit

import numpy as np


def references(text: str) -> list[int]:
    return [int(value) for value in re.findall(r"#(\d+)", text)]


class StepAssembly:
    """Read the assembly graph and rigid placements from SolidWorks AP214."""

    def __init__(self, path: Path):
        self.path = path
        source = path.read_bytes()
        self.sha256 = hashlib.sha256(source).hexdigest()
        text = source.decode("utf-8", errors="replace")
        self.entities = {
            int(index): body.strip()
            for index, body in re.findall(r"#(\d+)\s*=\s*(.*?);", text, re.S)
        }
        units = [value for value in self.entities.values() if "LENGTH_UNIT" in value]
        if not units or any(".MILLI., .METRE." not in value for value in units):
            raise ValueError("This exporter requires STEP length units in millimetres.")
        self.children: dict[int, list[tuple[int, int, np.ndarray]]] = defaultdict(list)
        parents, children = set(), set()
        for body in self.entities.values():
            if not body.startswith("CONTEXT_DEPENDENT_SHAPE_REPRESENTATION"):
                continue
            relation_id, definition_id = references(body)
            usage_id = references(self.entities[definition_id])[-1]
            parent_id, child_id = references(self.entities[usage_id])
            relation = self.entities[relation_id]
            match = re.search(
                r"REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION\s*\(\s*#(\d+)",
                relation,
            )
            if not match:
                raise ValueError(f"Missing rigid transformation for STEP usage #{usage_id}")
            first, second = references(self.entities[int(match.group(1))])
            transform = self.placement(first) @ np.linalg.inv(self.placement(second))
            self.children[parent_id].append((usage_id, child_id, transform))
            parents.add(parent_id)
            children.add(child_id)
        roots = parents - children
        if len(roots) != 1:
            raise ValueError(f"Expected one assembly root, found {len(roots)}.")
        self.root = roots.pop()

    def vector(self, index: int) -> np.ndarray:
        values = re.findall(r"\(([^()]*)\)", self.entities[index])[-1]
        return np.array([float(value) for value in values.split(",")])

    def placement(self, index: int) -> np.ndarray:
        point_id, axis_id, reference_id = references(self.entities[index])
        z_axis = self.vector(axis_id)
        z_axis /= np.linalg.norm(z_axis)
        x_axis = self.vector(reference_id)
        x_axis -= np.dot(x_axis, z_axis) * z_axis
        x_axis /= np.linalg.norm(x_axis)
        matrix = np.eye(4)
        matrix[:3, :3] = np.column_stack((x_axis, np.cross(z_axis, x_axis), z_axis))
        matrix[:3, 3] = self.vector(point_id) * 0.001
        return matrix

    def name(self, product_definition: int) -> str:
        formation = references(self.entities[product_definition])[0]
        product = references(self.entities[formation])[0]
        return re.findall(r"'([^']*)'", self.entities[product])[0]

    def parts(self) -> list[tuple[str, np.ndarray]]:
        result = []

        def visit(product: int, world: np.ndarray, ancestors: set[int]):
            if product in ancestors:
                raise ValueError("Cycle in STEP assembly graph.")
            if product not in self.children:
                result.append((self.name(product), world))
                return
            for _, child, local in sorted(self.children[product], key=lambda item: item[0]):
                visit(child, world @ local, ancestors | {product})

        visit(self.root, np.eye(4), set())
        return result


class MeshLibrary:
    def __init__(self, path: Path):
        self.manifest = json.loads(path.read_text(encoding="utf-8"))
        raw = gzip.decompress((path.parent / urlsplit(self.manifest["data"]).path).read_bytes())
        self.meshes, self.vertices, self.indices, self.points = {}, {}, {}, {}
        self.materials = {}
        for mesh in self.manifest["meshes"]:
            name = mesh["name"]
            self.meshes[name] = copy.deepcopy(mesh)
            offset = mesh["vertexByteOffset"]
            vertex_data = raw[offset : offset + mesh["vertexCount"] * 12]
            offset = self.manifest["vertexBytes"] + mesh["indexByteOffset"]
            self.vertices[name] = vertex_data
            self.indices[name] = raw[offset : offset + mesh["indexCount"] * 4]
            packed = np.frombuffer(vertex_data, dtype="<u2").reshape(-1, 6)
            self.points[name] = (
                packed[:, :3] / 65535 * np.array(mesh["bboxSize"])
                + np.array(mesh["bboxMin"])
            )
        for drawable in self.manifest["drawables"]:
            name = self.manifest["meshes"][drawable["mesh"]]["name"]
            self.materials[name] = {
                key: value
                for key, value in drawable.items()
                if key in {"color", "metalness", "roughness", "sharpness", "material"}
            }

    def bounds(self, parts: list[tuple[str, np.ndarray]], transform: np.ndarray):
        lo, hi = np.full(3, np.inf), np.full(3, -np.inf)
        for name, local in parts:
            matrix = transform @ local
            points = self.points[name] @ matrix[:3, :3].T + matrix[:3, 3]
            lo = np.minimum(lo, points.min(axis=0))
            hi = np.maximum(hi, points.max(axis=0))
        return lo, hi


def display_transform(parts, library: MeshLibrary, kind: str):
    transform = np.eye(4)
    if kind == "full":
        base = next(matrix for name, matrix in parts if name == "BaseV0.3")
        # BaseV0.3's plate lies in its local XZ plane; local +Y is its upper face.
        desired_frame = np.array([[1, 0, 0], [0, 0, -1], [0, 1, 0]])
        transform[:3, :3] = desired_frame @ base[:3, :3].T
        normal = transform[:3, :3] @ base[:3, 1]
        if not np.allclose(normal, [0, 0, 1], atol=1e-10):
            raise ValueError("Base-plate alignment failed.")
        reference = "BaseV0.3 local XZ plate plane is parallel to world XY."
    else:
        tube_name, tube = next(part for part in parts if part[0] == "glass tube inner 1")
        yoke = next(matrix for name, matrix in parts if name == "yoke 1")
        rod = next(matrix for name, matrix in parts if name == "ball joint link 1")
        long_axis = int(np.argmax(library.meshes[tube_name]["bboxSize"]))
        z_axis = tube[:3, long_axis].copy()
        if np.dot(z_axis, yoke[:3, 3] - rod[:3, 3]) < 0:
            z_axis *= -1
        z_axis /= np.linalg.norm(z_axis)
        reference_axis = np.array([0.0, 1.0, 0.0])
        if abs(np.dot(reference_axis, z_axis)) > 0.95:
            reference_axis = np.array([1.0, 0.0, 0.0])
        x_axis = np.cross(reference_axis, z_axis)
        x_axis /= np.linalg.norm(x_axis)
        transform[:3, :3] = np.vstack((x_axis, np.cross(z_axis, x_axis), z_axis))
        reference = "Cylinder axis is vertical, with the original yoke and cross pivot retained."
    lo, hi = library.bounds(parts, transform)
    transform[:3, 3] = [-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]]
    return transform, reference


def export(source: StepAssembly, library: MeshLibrary, output: Path, kind: str):
    parts = source.parts()
    missing = sorted({name for name, _ in parts} - library.meshes.keys())
    if missing:
        raise ValueError(f"CAD mesh library is missing actual geometry: {missing}")
    alignment, reference = display_transform(parts, library, kind)
    names = list(dict.fromkeys(name for name, _ in parts))
    meshes, vertex_buffers, index_buffers = [], [], []
    vertex_offset = index_offset = 0
    for name in names:
        mesh = copy.deepcopy(library.meshes[name])
        mesh.update(vertexByteOffset=vertex_offset, indexByteOffset=index_offset)
        meshes.append(mesh)
        vertex_buffers.append(library.vertices[name])
        index_buffers.append(library.indices[name])
        vertex_offset += len(vertex_buffers[-1])
        index_offset += len(index_buffers[-1])
    raw = b"".join(vertex_buffers + index_buffers)
    data = gzip.compress(raw, compresslevel=9, mtime=0)
    mesh_index = {name: index for index, name in enumerate(names)}
    nodes, drawables = [], []
    for name, matrix in parts:
        node = len(nodes)
        nodes.append(dict(name=name, parent=-1, static=(alignment @ matrix).flatten(order="F").tolist(), joint=None))
        drawables.append(dict(mesh=mesh_index[name], node=node, **copy.deepcopy(library.materials[name])))
    stem = "full-fresh" if kind == "full" else "actuator-fresh"
    binary_name = f"{stem}.bin.gz"
    version = f"needle-{kind}-{hashlib.sha256(data).hexdigest()[:16]}"
    manifest = dict(
        name=source.name(source.root),
        data=f"{binary_name}?v={version}",
        vertexBytes=vertex_offset,
        rawBytes=len(raw),
        gzipBytes=len(data),
        meshes=meshes,
        nodes=nodes,
        drawables=drawables,
        controls=[],
        camera=dict(yaw=-0.85, pitch=0.36 if kind == "full" else 0.22),
        shadingSharpness=library.manifest.get("shadingSharpness", 0),
        stats=dict(
            trianglesUnique=sum(mesh["triangles"] for mesh in meshes),
            uniqueParts=len(meshes),
            instances=len(nodes),
            tessellationMM=library.manifest["stats"].get("tessellationMM", 0.1),
        ),
        assetVersion=version,
        appearance=library.manifest.get("appearance", {}),
        provenance=dict(
            assemblyFile=source.path.name,
            assemblySHA256=source.sha256,
            geometry="Exact existing CAD tessellation, with no decimation or substitute geometry.",
            placement="All instances rebuilt from the supplied STEP assembly graph.",
        ),
        alignment=dict(description=reference, worldFromCAD=alignment.flatten(order="F").tolist()),
    )
    output.mkdir(parents=True, exist_ok=True)
    (output / binary_name).write_bytes(data)
    (output / f"{stem}.json").write_text(json.dumps(manifest, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{stem}: {len(nodes)} instances / {len(meshes)} original CAD parts / {len(data):,} compressed bytes")


def main():
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--full-step", type=Path, required=True)
    parser.add_argument("--actuator-step", type=Path, required=True)
    parser.add_argument("--mesh-library", type=Path, default=root / "demos/needle/models/full-fresh.json")
    parser.add_argument("--output", type=Path, default=root / "demos/needle/models")
    args = parser.parse_args()
    library = MeshLibrary(args.mesh_library)
    export(StepAssembly(args.full_step), library, args.output, "full")
    export(StepAssembly(args.actuator_step), library, args.output, "actuator")


if __name__ == "__main__":
    main()
