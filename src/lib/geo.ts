import type { FeatureCollection, Geometry, Position } from 'geojson'

/**
 * Invierte el orden de los anillos para d3-geo.
 *
 * GeoJSON (RFC 7946) pide los anillos exteriores en sentido antihorario.
 * d3-geo interpreta los polígonos sobre la esfera con la convención
 * contraria: para él un anillo antihorario describe «todo el globo menos
 * esta forma». Con los archivos tal cual salen del INE, el mapa se pinta
 * como una mancha que cubre el mundo.
 *
 * Los archivos de `public/geo/` se dejan conformes a la norma —sirven para
 * cualquier otro visor— y la corrección se aplica aquí, junto a la
 * dependencia que la necesita.
 */
export function rebobinarParaD3<P>(
  coleccion: FeatureCollection<Geometry, P>,
): FeatureCollection<Geometry, P> {
  return {
    ...coleccion,
    features: coleccion.features.map((f) => ({
      ...f,
      geometry: rebobinarGeometria(f.geometry),
    })),
  }
}

function rebobinarGeometria(g: Geometry): Geometry {
  if (g.type === 'Polygon') {
    return { ...g, coordinates: rebobinarPoligono(g.coordinates) }
  }
  if (g.type === 'MultiPolygon') {
    return { ...g, coordinates: g.coordinates.map(rebobinarPoligono) }
  }
  return g
}

/** Exterior en sentido horario, huecos en antihorario. */
function rebobinarPoligono(poligono: Position[][]): Position[][] {
  return poligono.map((anillo, i) => {
    const horario = areaFirmada(anillo) < 0
    const debeSerHorario = i === 0
    return horario === debeSerHorario ? anillo : [...anillo].reverse()
  })
}

/** Fórmula del cordón de zapato. Negativa = sentido horario. */
function areaFirmada(anillo: Position[]): number {
  let suma = 0
  for (let i = 0; i < anillo.length - 1; i++) {
    suma += anillo[i][0] * anillo[i + 1][1] - anillo[i + 1][0] * anillo[i][1]
  }
  return suma / 2
}
