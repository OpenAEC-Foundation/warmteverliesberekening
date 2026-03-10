# -*- coding: utf-8 -*-
"""3D grensvlakken analyse via SpatialElementGeometryCalculator.

Primaire methode: SpatialElementGeometryCalculator geeft 3D faces inclusief
vloer, plafond en schuine vlakken.

Fallback: Room.GetBoundarySegments() geeft alleen 2D wandsegmenten.
"""
from Autodesk.Revit.DB import (
    SpatialElementGeometryCalculator,
    SpatialElementBoundaryOptions,
    SpatialElementBoundaryLocation,
    XYZ,
    UV,
)

from warmteverlies.unit_utils import internal_to_sqm
from warmteverlies.constants import MIN_FACE_AREA_M2


def analyze_boundaries(doc, room):
    """Analyseer alle grensvlakken van een room via 3D geometrie.

    Probeert eerst SpatialElementGeometryCalculator (3D).
    Bij falen: fallback naar GetBoundarySegments (2D, alleen wanden).

    Args:
        doc: Revit Document
        room: Revit Room element

    Returns:
        list[dict]: Boundary faces met area, host element, normal, positie
    """
    try:
        return _analyze_3d(doc, room)
    except Exception:
        return _analyze_2d_fallback(doc, room)


def _analyze_3d(doc, room):
    """3D analyse via SpatialElementGeometryCalculator."""
    calculator = SpatialElementGeometryCalculator(doc)
    result = calculator.CalculateSpatialElementGeometry(room)
    spatial_solid = result.GetGeometry()

    boundaries = []
    for face in spatial_solid.Faces:
        sub_faces = result.GetBoundaryFaceInfo(face)

        if not sub_faces or sub_faces.Count == 0:
            continue

        for sub_face in sub_faces:
            area_sqft = sub_face.GetSubface().Area
            area_m2 = internal_to_sqm(area_sqft)

            if area_m2 < MIN_FACE_AREA_M2:
                continue

            host_element = None
            host_element_id = None
            host_category = None

            linked_elem_id = sub_face.SpatialBoundaryElement
            if linked_elem_id:
                host_id = linked_elem_id.HostElementId
                if host_id and host_id.IntegerValue > 0:
                    host_element = doc.GetElement(host_id)
                    host_element_id = host_id.IntegerValue
                    if host_element:
                        host_category = _get_category_name(host_element)

            normal = _get_face_normal(sub_face.GetSubface())
            position_type = _classify_normal(normal)

            boundaries.append({
                "area_m2": area_m2,
                "host_element": host_element,
                "host_element_id": host_element_id,
                "host_category": host_category,
                "face_normal": (normal.X, normal.Y, normal.Z),
                "position_type": position_type,
            })

    return boundaries


def _analyze_2d_fallback(doc, room):
    """Fallback: 2D boundary segments + synthetische vloer/plafond."""
    opt = SpatialElementBoundaryOptions()
    opt.SpatialElementBoundaryLocation = (
        SpatialElementBoundaryLocation.Finish
    )

    boundaries = []
    segments_list = room.GetBoundarySegments(opt)
    if not segments_list:
        return boundaries

    for segment_loop in segments_list:
        for segment in segment_loop:
            length_ft = segment.GetCurve().Length
            area_sqft = length_ft * room.UnboundedHeight

            area_m2 = internal_to_sqm(area_sqft)
            if area_m2 < MIN_FACE_AREA_M2:
                continue

            host_element = None
            host_element_id = None
            host_category = None

            elem_id = segment.ElementId
            if elem_id and elem_id.IntegerValue > 0:
                host_element = doc.GetElement(elem_id)
                host_element_id = elem_id.IntegerValue
                if host_element:
                    host_category = _get_category_name(host_element)

            boundaries.append({
                "area_m2": area_m2,
                "host_element": host_element,
                "host_element_id": host_element_id,
                "host_category": host_category,
                "face_normal": (0.0, 0.0, 0.0),
                "position_type": "wall",
            })

    # Synthetische vloer en plafond
    floor_area_m2 = internal_to_sqm(room.Area)
    if floor_area_m2 >= MIN_FACE_AREA_M2:
        boundaries.append({
            "area_m2": floor_area_m2,
            "host_element": None,
            "host_element_id": None,
            "host_category": "Floor",
            "face_normal": (0.0, 0.0, -1.0),
            "position_type": "floor",
        })
        boundaries.append({
            "area_m2": floor_area_m2,
            "host_element": None,
            "host_element_id": None,
            "host_category": None,
            "face_normal": (0.0, 0.0, 1.0),
            "position_type": "ceiling",
        })

    return boundaries


def _get_face_normal(face):
    """Bepaal de gemiddelde normal van een face."""
    try:
        bbox = face.GetBoundingBox()
        mid_u = (bbox.Min.U + bbox.Max.U) / 2.0
        mid_v = (bbox.Min.V + bbox.Max.V) / 2.0
        normal = face.ComputeNormal(UV(mid_u, mid_v))
        return normal
    except Exception:
        return XYZ(0, 0, 0)


def _classify_normal(normal):
    """Classificeer face normal: ceiling (Z>0.7), floor (Z<-0.7), wall."""
    z = normal.Z
    if z > 0.7:
        return "ceiling"
    elif z < -0.7:
        return "floor"
    return "wall"


def _get_category_name(element):
    """Haal de categorienaam op: Wall, Floor, Roof, Ceiling."""
    if element is None:
        return None

    cat = element.Category
    if cat is None:
        return None

    cat_id = cat.Id.IntegerValue
    # BuiltInCategory integer values
    if cat_id == -2000011:
        return "Wall"
    elif cat_id == -2000032:
        return "Floor"
    elif cat_id == -2000035:
        return "Roof"
    elif cat_id == -2000038:
        return "Ceiling"
    return cat.Name
