#!/usr/bin/env python3
"""
Convierte el Marco Geográfico Electoral del INE a los GeoJSON que lee el
mapa del sistema.

El INE publica la cartografía por estado, en shapefile y proyectada en
UTM. El mapa necesita GeoJSON en lon/lat (EPSG:4326) y simplificado: los
polígonos originales de un estado pesan decenas de megabytes y el
navegador no los dibuja a tiempo.

    python3 herramientas/geo-desde-shapefile.py <carpeta-del-estado> <clave> <prefijo>

Ejemplo:
    python3 herramientas/geo-desde-shapefile.py "~/08 CHIHUAHUA" 08 chih

Genera `public/geo/<prefijo>-municipios.json` y
`<prefijo>-distritos-locales.json`, y actualiza `public/geo/indice.json`.

Existe como script y no como paso manual porque esto se repite: la
distritación definitiva para 2027 se publica en noviembre de 2026 y hay
que volver a correrlo con los archivos nuevos.
"""
import json
import os
import sys
from datetime import date

import shapefile
from pyproj import Transformer


def leer_proyeccion(ruta_prj):
    """El .prj dice en qué proyección vienen las coordenadas."""
    with open(ruta_prj, encoding='latin-1') as f:
        wkt = f.read()
    return Transformer.from_crs(wkt, 'EPSG:4326', always_xy=True)


def simplificar(puntos, tolerancia):
    """
    Douglas-Peucker.

    Un estado completo trae cientos de miles de vértices y en pantalla se
    dibuja en unos cientos de píxeles: la mayoría no se distinguen. Se
    quitan los que no cambian la silueta más que la tolerancia.
    """
    if len(puntos) < 3:
        return puntos

    inicio, fin = puntos[0], puntos[-1]
    dx, dy = fin[0] - inicio[0], fin[1] - inicio[1]
    norma = (dx * dx + dy * dy) ** 0.5

    peor, cual = 0.0, 0
    for i in range(1, len(puntos) - 1):
        p = puntos[i]
        if norma == 0:
            d = ((p[0] - inicio[0]) ** 2 + (p[1] - inicio[1]) ** 2) ** 0.5
        else:
            d = abs(dy * p[0] - dx * p[1] + fin[0] * inicio[1] - fin[1] * inicio[0]) / norma
        if d > peor:
            peor, cual = d, i

    if peor <= tolerancia:
        return [inicio, fin]

    izq = simplificar(puntos[: cual + 1], tolerancia)
    der = simplificar(puntos[cual:], tolerancia)
    return izq[:-1] + der


def anillos(forma, transformador, tolerancia):
    """
    Separa la forma en sus anillos y los reproyecta.

    Un shapefile guarda todos los anillos de un polígono en una sola
    lista con índices de corte; aquí se vuelven polígonos de GeoJSON.
    """
    puntos = forma.points
    cortes = list(forma.parts) + [len(puntos)]
    salida = []
    for i in range(len(cortes) - 1):
        tramo = puntos[cortes[i]:cortes[i + 1]]
        if len(tramo) < 4:
            continue
        lon, lat = transformador.transform(*zip(*tramo))
        anillo = simplificar(list(zip(lon, lat)), tolerancia)
        # Un anillo tiene que cerrar; simplificar puede dejarlo abierto.
        if anillo[0] != anillo[-1]:
            anillo.append(anillo[0])
        if len(anillo) >= 4:
            salida.append([[round(x, 5), round(y, 5)] for x, y in anillo])
    return salida


def codificacion(base):
    """El .cpg dice en qué codificación viene el .dbf; sin él, latin-1."""
    try:
        with open(base + '.cpg', encoding='ascii') as f:
            return f.read().strip() or 'latin-1'
    except OSError:
        return 'latin-1'


def capa(carpeta, archivo, clave_entidad, campos, tolerancia):
    base = os.path.join(carpeta, archivo)
    lector = shapefile.Reader(base, encoding=codificacion(base))
    transformador = leer_proyeccion(base + '.prj')
    nombres = [c[0] for c in lector.fields[1:]]

    rasgos = []
    for registro, forma in zip(lector.records(), lector.shapes()):
        datos = dict(zip(nombres, registro))
        if str(datos.get('entidad', '')).zfill(2) != clave_entidad:
            continue
        poligonos = anillos(forma, transformador, tolerancia)
        if not poligonos:
            continue
        rasgos.append({
            'type': 'Feature',
            'properties': {k: v(datos) for k, v in campos.items()},
            'geometry': {'type': 'MultiPolygon', 'coordinates': [[p] for p in poligonos]},
        })
    lector.close()
    return rasgos


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(1)

    carpeta, clave, prefijo = os.path.expanduser(sys.argv[1]), sys.argv[2].zfill(2), sys.argv[3]
    raiz = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'geo')

    # La tolerancia va en grados. Los municipios se ven de cerca y los
    # distritos siempre de lejos, así que aguantan más simplificación.
    trabajos = [
        ('MUNICIPIO', f'{prefijo}-municipios.json', 0.0012, {
            'clave': lambda d: str(d['municipio']).zfill(3),
            'nombre': lambda d: (d.get('nombre') or '').strip(),
        }),
        ('DISTRITO_LOCAL', f'{prefijo}-distritos-locales.json', 0.0025, {
            'clave': lambda d: str(d['distrito_l']).zfill(2),
        }),
    ]

    indice_ruta = os.path.join(raiz, 'indice.json')
    with open(indice_ruta, encoding='utf-8') as f:
        indice = json.load(f)

    for archivo, salida, tolerancia, campos in trabajos:
        rasgos = capa(carpeta, archivo, clave, campos, tolerancia)
        geojson = {'type': 'FeatureCollection', 'features': rasgos}
        ruta = os.path.join(raiz, salida)
        with open(ruta, 'w', encoding='utf-8') as f:
            json.dump(geojson, f, ensure_ascii=False, separators=(',', ':'))
        bytes_ = os.path.getsize(ruta)
        indice['capas'][salida.replace('.json', '')] = {
            'archivo': salida,
            'rasgos': len(rasgos),
            'bytes': bytes_,
            'origen': f'{archivo}.shp (ENTIDAD={clave})',
            'simplificacion': f'Douglas-Peucker {tolerancia}°',
        }
        print(f'  {salida}: {len(rasgos)} rasgos · {bytes_ // 1024} KB')

    indice['generado'] = date.today().isoformat()
    with open(indice_ruta, 'w', encoding='utf-8') as f:
        json.dump(indice, f, ensure_ascii=False, indent=2)


if __name__ == '__main__':
    sys.setrecursionlimit(20000)
    main()
